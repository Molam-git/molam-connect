export function toAmountWithinCaps({ txAmount, rule }: {
    txAmount: number; rule: any;
}) {
    if (txAmount < Number(rule.min_amount || 0)) return 0;

    const base = rule.percent ? (txAmount * Number(rule.percent) / 100.0) : Number(rule.fixed_amount || 0);
    const capped = rule.cap_per_tx && Number(rule.cap_per_tx) > 0
        ? Math.min(base, Number(rule.cap_per_tx))
        : base;

    return Math.max(0, Number(capped.toFixed(2)));
}