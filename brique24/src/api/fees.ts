// Client-only display of fee policy (server is authoritative)
export function explainFee(policy: 'P2P' | 'CASHIN_SELF' | 'CASHIN_OTHER' | 'CASHOUT' | 'BILL' | 'MERCHANT', amount: number, currency = 'USD') {
    switch (policy) {
        case 'P2P':           // sender pays 0.90%
            return { fee: round(amount * 0.009, 2), note: 'Sender pays 0.90% (no agent split).' };
        case 'CASHIN_SELF':   // free
            return { fee: 0, note: 'Cash-In to your wallet is free.' };
        case 'CASHIN_OTHER':  // paid (Wave-like), e.g. 0.70%
            return { fee: round(amount * 0.007, 2), note: 'Cash-In to another wallet includes service fee.' };
        case 'CASHOUT':       // free to user
            return { fee: 0, note: 'Cash-Out via agent/bank is free to you.' };
        case 'BILL':          // base utilities free
            return { fee: 0, note: 'Utilities (water, electricity, subscriptions) are free.' };
        case 'MERCHANT':      // merchant pays (Stripe-like), buyer sees 0
            return { fee: 0, note: 'Merchant absorbs checkout fee (≈2.25% + $0.25).' };
    }
}
const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;