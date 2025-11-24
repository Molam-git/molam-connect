// src/agents/utils/fees.ts
export function calcFee(pricing: any, amountMinor: number): number {
    if (pricing.fee_type === "FREE") return 0;
    let fee = 0;
    if (pricing.fee_type === "PERCENT" || pricing.fee_type === "MIXED") {
        fee += Math.floor((amountMinor * (pricing.percent_bp || 0)) / 10_000);
    }
    if (pricing.fee_type === "FLAT" || pricing.fee_type === "MIXED") {
        fee += pricing.flat_minor || 0;
    }
    if (pricing.min_fee_minor && fee < pricing.min_fee_minor) fee = pricing.min_fee_minor;
    if (pricing.max_fee_minor && pricing.max_fee_minor > 0 && fee > pricing.max_fee_minor) fee = pricing.max_fee_minor;
    return fee;
}