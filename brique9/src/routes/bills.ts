import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../shared/prisma';
import { ensureIdempotency } from '../security/idempotency';
import { siraGuard } from '../sira/guard';
import { withLedgerTx } from '../wallet/ledger';
import { publishEvent } from '../shared/kafka';
import { signWebhook } from '../security/hmac';
import { toMinor } from '../shared/money';

export const billsRouter: FastifyPluginAsync = async (app) => {

    app.get('/billers', async (req: any, reply) => {
        const { country, category } = req.query as any;
        const where: any = { status: 'ACTIVE' };
        if (country) where.country_code = country;
        if (category) where.category = category;
        const billers = await prisma.molam_billers.findMany({ where });
        return reply.send(billers);
    });

    app.post('/accounts', async (req: any, reply) => {
        const userId = req.user.user_id;
        const { billerId, productId, customerRef, nickname, country } = req.body;

        // Optional: call biller API to validate customerRef
        const biller = await prisma.molam_billers.findUnique({ where: { biller_id: billerId } });
        if (!biller || biller.status !== 'ACTIVE') {
            return reply.code(400).send({ error: 'INVALID_BILLER' });
        }

        const account = await prisma.molam_bill_accounts.create({
            data: {
                user_id: userId,
                biller_id: billerId,
                product_id: productId || null,
                customer_ref: customerRef,
                nickname: nickname || null,
                country_code: country || biller.country_code,
                currency: biller.currency,
                status: 'ACTIVE'
            }
        });

        await publishEvent('bill.account.linked', {
            userId,
            accountId: account.account_id,
            billerId
        });

        return reply.code(201).send(account);
    });

    app.get('/accounts', async (req: any, reply) => {
        const userId = req.user.user_id;
        const accounts = await prisma.molam_bill_accounts.findMany({
            where: { user_id: userId, status: 'ACTIVE' },
            include: {
                biller: { select: { name: true, category: true } },
                product: { select: { product_name: true } }
            }
        });
        return reply.send(accounts);
    });

    app.post('/invoices/lookup', async (req: any, reply) => {
        const { accountId } = req.body;
        const account = await prisma.molam_bill_accounts.findUnique({
            where: { account_id: accountId }
        });

        if (!account) return reply.code(404).send({ error: 'ACCOUNT_NOT_FOUND' });

        // For POSTPAID: call external biller API to fetch current invoice
        // Mock: no external call here; use latest pending or create placeholder
        const invoice = await prisma.molam_bill_invoices.findFirst({
            where: {
                account_id: accountId,
                status: { in: ['PENDING', 'PARTIAL'] }
            },
            orderBy: { created_at: 'desc' }
        });

        return reply.send(invoice || { status: 'NO_INVOICE' });
    });

    app.post('/payments', {
        preHandler: [ensureIdempotency]
    }, async (req: any, reply) => {
        const userId = req.user.user_id;
        const { accountId, invoiceId, amount, currency, walletId } = req.body;
        const idempotencyKey = req.headers['idempotency-key'] as string;

        const account = await prisma.molam_bill_accounts.findUnique({
            where: { account_id: accountId }
        });

        if (!account) {
            return reply.code(404).send({ error: 'ACCOUNT_NOT_FOUND' });
        }

        // SIRA check (risk/limits)
        await siraGuard({
            userId,
            channel: req.headers['x-channel'] || 'APP',
            amount,
            currency,
            kind: 'BILL_PAYMENT'
        });

        // Zero user fee for base categories
        const biller = await prisma.molam_billers.findUnique({
            where: { biller_id: account.biller_id }
        });

        if (!biller) {
            return reply.code(400).send({ error: 'BILLER_NOT_FOUND' });
        }

        const userFee = 0; // free policy
        const totalDebit = Number(amount) + userFee;

        // Create INIT payment
        const payment = await prisma.molam_bill_payments.create({
            data: {
                user_id: userId,
                account_id: accountId,
                biller_id: account.biller_id,
                product_id: account.product_id,
                invoice_id: invoiceId || null,
                wallet_id: walletId,
                amount,
                currency,
                user_fee: userFee,
                partner_fee: 0,
                total_debit: totalDebit,
                status: 'INIT',
                idempotency_key: idempotencyKey
            }
        });

        try {
            // Atomic wallet debit + ledger write
            await withLedgerTx({
                walletId,
                amountMinor: toMinor(totalDebit, currency),
                currency,
                memo: `BILL:${payment.bill_payment_id}`
            });

            // Update payment status to AUTHORIZED
            await prisma.molam_bill_payments.update({
                where: { bill_payment_id: payment.bill_payment_id },
                data: { status: 'AUTHORIZED' }
            });

            // Call biller (async) — put to Kafka for connector worker
            await publishEvent('bill.payment.requested', {
                billPaymentId: payment.bill_payment_id,
                billerId: biller.biller_id
            });

            return reply.code(201).send({
                billPaymentId: payment.bill_payment_id,
                status: 'AUTHORIZED'
            });
        } catch (error: any) {
            // Update payment status on failure
            await prisma.molam_bill_payments.update({
                where: { bill_payment_id: payment.bill_payment_id },
                data: {
                    status: 'FAILED',
                    failure_reason: error.message
                }
            });
            throw error;
        }
    });

    app.get('/payments/:billPaymentId', async (req: any, reply) => {
        const { billPaymentId } = req.params as any;
        const payment = await prisma.molam_bill_payments.findUnique({
            where: { bill_payment_id: billPaymentId }
        });

        if (!payment) return reply.code(404).send({ error: 'NOT_FOUND' });
        return reply.send(payment);
    });

    // Inbound webhook from biller confirming success/failure
    app.post('/webhooks/biller', async (req: any, reply) => {
        // Validate signature at API Gateway; here verify again if needed
        const { billPaymentId, status, externalTxId } = req.body;

        const payment = await prisma.molam_bill_payments.findUnique({
            where: { bill_payment_id: billPaymentId }
        });

        if (!payment) {
            return reply.code(404).send({ error: 'PAYMENT_NOT_FOUND' });
        }

        if (status === 'SUCCESS') {
            await prisma.molam_bill_payments.update({
                where: { bill_payment_id: billPaymentId },
                data: {
                    status: 'CONFIRMED',
                    confirmed_at: new Date(),
                    external_tx_id: externalTxId || null
                }
            });

            // Send receipt to user; notify SIRA
            await publishEvent('bill.payment.confirmed', { billPaymentId });
        } else if (status === 'FAILED') {
            // Reverse wallet debit (refund)
            await withLedgerTx({
                walletId: payment.wallet_id,
                amountMinor: toMinor(payment.total_debit, payment.currency) * -1,
                currency: payment.currency,
                memo: `BILL_REFUND:${payment.bill_payment_id}`
            });

            await prisma.molam_bill_payments.update({
                where: { bill_payment_id: billPaymentId },
                data: {
                    status: 'FAILED',
                    failure_reason: 'BILLER_REJECT'
                }
            });
        }

        // Log inbound webhook
        await prisma.molam_bill_webhooks.create({
            data: {
                direction: 'INBOUND',
                biller_id: payment.biller_id,
                url: 'inbound',
                payload: req.body,
                headers: req.headers as any,
                status_code: 200,
                signature_valid: true,
                delivery_status: 'SUCCESS'
            }
        });

        return reply.send({ ok: true });
    });
};