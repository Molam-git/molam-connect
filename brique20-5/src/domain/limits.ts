import { prisma } from "../infra/db.js";

export async function checkP2PLimits(params: {
    userId: string;
    country?: string;
    kycLevel?: string;
    currency: string;
    amountCents: bigint;
}): Promise<{ ok: boolean; reason?: string }> {
    // Get applicable limits
    const limit = await prisma.molam_limits.findFirst({
        where: {
            scope: 'P2P_VIRTUAL',
            active: true,
            OR: [
                { country: params.country, kyc_level: params.kycLevel },
                { country: params.country, kyc_level: null },
                { country: null, kyc_level: params.kycLevel },
                { country: null, kyc_level: null }
            ]
        },
        orderBy: [{ country: 'desc' }, { kyc_level: 'desc' }]
    });

    if (!limit) return { ok: true };

    // Get today's total
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTotal = await prisma.wallet_transactions.aggregate({
        where: {
            type: 'P2P_VIRTUAL',
            status: 'SUCCEEDED',
            sender_wallet: {
                user_id: params.userId
            },
            currency: params.currency,
            created_at: { gte: todayStart }
        },
        _sum: {
            amount_cents: true,
            fee_cents: true
        }
    });

    const todaySpent = (todayTotal._sum.amount_cents || 0n) + (todayTotal._sum.fee_cents || 0n);

    // Get monthly total
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthTotal = await prisma.wallet_transactions.aggregate({
        where: {
            type: 'P2P_VIRTUAL',
            status: 'SUCCEEDED',
            sender_wallet: {
                user_id: params.userId
            },
            currency: params.currency,
            created_at: { gte: monthStart }
        },
        _sum: {
            amount_cents: true,
            fee_cents: true
        }
    });

    const monthSpent = (monthTotal._sum.amount_cents || 0n) + (monthTotal._sum.fee_cents || 0n);

    // Check limits
    if (todaySpent + params.amountCents > limit.daily_cents) {
        return { ok: false, reason: "daily_limit_exceeded" };
    }

    if (monthSpent + params.amountCents > limit.monthly_cents) {
        return { ok: false, reason: "monthly_limit_exceeded" };
    }

    return { ok: true };
}