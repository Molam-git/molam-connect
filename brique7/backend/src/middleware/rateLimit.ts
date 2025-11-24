import rateLimit from 'express-rate-limit';

// Export nommé correct
export const qrRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requêtes max
    message: {
        error: 'TOO_MANY_REQUESTS',
        message: 'Trop de requêtes QR, veuillez réessayer plus tard.'
    }
});

export const paymentRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // 20 paiements max
    message: {
        error: 'PAYMENT_LIMIT_EXCEEDED',
        message: 'Trop de tentatives de paiement, veuillez réessayer dans 5 minutes.'
    }
});

// Ou si vous préférez une fonction générique :
export const createRateLimit = (windowMs: number, max: number, message: string) => {
    return rateLimit({
        windowMs,
        max,
        message: {
            error: 'RATE_LIMIT_EXCEEDED',
            message
        }
    });
};