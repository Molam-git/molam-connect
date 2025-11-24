// src/config/transferConfig.ts

export const transferConfig = {
    // Time window for cancellation (in minutes)
    cancellationWindow: 5,

    // Auto-confirmation timeout (in minutes)
    autoConfirmTimeout: 30,

    // Default limits by KYC level
    limits: {
        P0: { per_tx_max: 100, daily_max: 500 },
        P1: { per_tx_max: 1000, daily_max: 5000 },
        P2: { per_tx_max: 5000, daily_max: 25000 },
        P3: { per_tx_max: 10000, daily_max: 50000 }
    },

    // Fee structure
    fees: {
        domestic: { percentage: 0, fixed: 0 },
        international: { percentage: 1.5, fixed: 1 },
        cross_currency: { percentage: 2, fixed: 2 }
    },

    // SIRA thresholds
    sira: {
        block_threshold: 80,
        review_threshold: 60
    }
};