import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../shared/prisma';

export async function ensureIdempotency(req: FastifyRequest, reply: FastifyReply) {
    const key = req.headers['idempotency-key'];

    if (!key || typeof key !== 'string') {
        return reply.code(400).send({ error: 'IDEMPOTENCY_REQUIRED' });
    }

    const existing = await prisma.molam_bill_payments.findFirst({
        where: { idempotency_key: key }
    });

    if (existing) {
        return reply.code(201).send({
            billPaymentId: existing.bill_payment_id,
            status: existing.status
        });
    }
}