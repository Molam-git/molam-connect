export const metrics = {
    payoutCycleCreated: 0,
    payoutAmountSum: 0,
    payoutConfirmed: 0,
    payoutFailed: 0,

    incrementPayoutCycleCreated() {
        this.payoutCycleCreated++;
    },

    addPayoutAmount(amount: number) {
        this.payoutAmountSum += amount;
    },

    incrementPayoutConfirmed() {
        this.payoutConfirmed++;
    },

    incrementPayoutFailed() {
        this.payoutFailed++;
    },

    getMetrics() {
        return {
            payout_cycle_created_total: this.payoutCycleCreated,
            payout_amount_sum: this.payoutAmountSum,
            payout_confirmed_total: this.payoutConfirmed,
            payout_failed_total: this.payoutFailed
        };
    }
};