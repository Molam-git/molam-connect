export function computeFees(rail: any, amount: number) {
    const bankFee = +(rail.bank_fee_fixed || 0) + amount * +(rail.bank_fee_pct || 0);
    const molamFee = +(rail.molam_fee_fixed || 0) + amount * +(rail.molam_fee_pct || 0.009);
    const total = round2(bankFee + molamFee);
    return { bank_fee: round2(bankFee), molam_fee: round2(molamFee), total_fee: total };
}

function round2(n: number) { return Math.round(n * 100) / 100; }