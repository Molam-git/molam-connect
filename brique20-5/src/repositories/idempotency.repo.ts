import { prisma } from "../infra/db.js";
import crypto from "crypto";

export async function acquireIdempotency(
    userId: string,
    endpoint: string,
    key: string,
    payload: any
) {
    const requestHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");

    try {
        const record = await prisma.idempotency_keys.create({
            data: {
                user_id: userId,
                endpoint,
                idem_key: key,
                request_hash: requestHash,
                status: "LOCKED"
            }
        });
        return { ok: true, record };
    } catch (error: any) {
        // Unique constraint violation
        if (error.code === 'P2002') {
            const existing = await prisma.idempotency_keys.findUnique({
                where: {
                    user_id_endpoint_idem_key: {
                        user_id: userId,
                        endpoint,
                        idem_key: key
                    }
                }
            });

            if (!existing) throw error;

            if (existing.request_hash !== requestHash) {
                return { ok: false, conflict: true };
            }

            return { ok: true, record: existing };
        }
        throw error;
    }
}

export async function completeIdempotency(id: bigint, transactionId: string) {
    await prisma.idempotency_keys.update({
        where: { id },
        data: {
            status: "COMPLETED",
            transaction_id: transactionId
        }
    });
}