import { prisma } from '../src/shared/prisma';
import { signWebhook } from '../src/security/hmac';

interface BillerAPIResponse {
    status: 'SUCCESS' | 'FAILED';
    externalTxId?: string;
    message?: string;
}

async function callBillerAPI(biller: any, payload: any): Promise<BillerAPIResponse> {
    // Implement real HTTP client with mTLS/OAuth2 based on biller.api_auth_type
    // This is a mock implementation
    console.log(`Calling biller API: ${biller.name}`, payload);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock response - in production, implement actual API integration
    return {
        status: 'SUCCESS',
        externalTxId: 'EXT-' + Date.now()
    };
}

export async function processBillPayment(message: {
    billPaymentId: string;
    billerId: string;
}) {
    const payment = await prisma.molam_bill_payments.findUnique({
        where: { bill_payment_id: message.billPaymentId }
    });

    const biller = await prisma.molam_billers.findUnique({
        where: { biller_id: message.billerId }
    });

    if (!payment || !biller) {
        console.error('Payment or biller not found:', message);
        return;
    }

    const account = await prisma.molam_bill_accounts.findUnique({
        where: { account_id: payment.account_id }
    });

    if (!account) {
        console.error('Account not found for payment:', payment.bill_payment_id);
        return;
    }

    try {
        const res = await callBillerAPI(biller, {
            customerRef: account.customer_ref,
            amount: payment.amount,
            currency: payment.currency,
            billPaymentId: payment.bill_payment_id
        });

        if (res.status === 'SUCCESS') {
            await prisma.molam_bill_payments.update({
                where: { bill_payment_id: payment.bill_payment_id },
                data: {
                    status: 'SENT_TO_BILLER',
                    external_tx_id: res.externalTxId
                }
            });

            // Notify biller via webhook (if required)
            if (biller.webhook_url && biller.webhook_secret) {
                const body = JSON.stringify({
                    billPaymentId: payment.bill_payment_id,
                    status: 'SUCCESS',
                    externalTxId: res.externalTxId
                });

                const signature = signWebhook(biller.webhook_secret, body);

                await prisma.molam_bill_webhooks.create({
                    data: {
                        direction: 'OUTBOUND',
                        biller_id: biller.biller_id,
                        url: biller.webhook_url,
                        payload: JSON.parse(body), // Store as JSONB
                        headers: { 'x-molam-signature': signature } as any,
                        delivery_status: 'PENDING'
                    }
                });

                // In production, implement webhook delivery worker
                console.log('Webhook queued for delivery to:', biller.webhook_url);
            }
        } else {
            await prisma.molam_bill_payments.update({
                where: { bill_payment_id: payment.bill_payment_id },
                data: {
                    status: 'FAILED',
                    failure_reason: 'BILLER_DECLINED: ' + (res.message || 'Unknown error')
                }
            });
        }
    } catch (error: any) {
        console.error('Biller API call failed:', error);

        await prisma.molam_bill_payments.update({
            where: { bill_payment_id: payment.bill_payment_id },
            data: {
                status: 'FAILED',
                failure_reason: `BILLER_API_ERROR: ${error.message}`
            }
        });
    }
}