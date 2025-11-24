import { prisma } from "../infra/db.js";

export type FeeParams = {
    feeType: "P2P_VIRTUAL";
    country?: string;
    currency: string;
    kycLevel?: string;
    amountCents: bigint;
    minorUnits: number;
};

export async function computeP2PFee(p: FeeParams): Promise<bigint> {
    const cfg = await prisma.molam_fee_config.findFirst({
        where: {
            fee_type: "P2P_VIRTUAL",
            active: true,
            OR: [
                { country: p.country ?? undefined, currency: p.currency, kyc_level: p.kycLevel ?? undefined },
                { country: p.country ?? undefined, currency: p.currency, kyc_level: null },
                { country: p.country ?? undefined, currency: null, kyc_level: p.kycLevel ?? undefined },
                { country: null, currency: p.currency, kyc_level: null },
                { country: null, currency: null, kyc_level: null }
            ]
        },
        orderBy: { id: "desc" }
    });

    const percent = cfg?.percent ?? 0.009; // 0.90%
    const minFee = BigInt(cfg?.min_fee_cents ?? 0);
    const maxFee = cfg?.max_fee_cents ?? null;

    // Calculate fee with bankers rounding
    const feeFloat = Number(p.amountCents) * Number(percent);
    let fee = BigInt(Math.round(feeFloat));

    if (fee < minFee) fee = minFee;
    if (maxFee !== null && fee > BigInt(maxFee)) fee = BigInt(maxFee);

    return fee;
}