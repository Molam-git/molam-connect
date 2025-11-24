import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Security utilities for Molam Agents API
 */

// HMAC signature for events
export const signEvent = (payload: any, secret: string): string => {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
};

// Verify HMAC signature
export const verifyEventSignature = (payload: any, signature: string, secret: string): boolean => {
    const expectedSignature = signEvent(payload, secret);
    return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
};

// Generate service JWT token
export const generateServiceToken = (serviceName: string, secret: string): string => {
    return jwt.sign(
        {
            service: serviceName,
            iat: Math.floor(Date.now() / 1000)
        },
        secret,
        { expiresIn: '1h' }
    );
};

// Validate KYC data
export const validateKYCData = (kycData: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!kycData.identityDocument) {
        errors.push('Identity document is required');
    }

    if (!kycData.proofOfAddress) {
        errors.push('Proof of address is required');
    }

    if (!kycData.fullName) {
        errors.push('Full name is required');
    }

    if (!kycData.dateOfBirth) {
        errors.push('Date of birth is required');
    }

    // Validate age (must be at least 18)
    if (kycData.dateOfBirth) {
        const birthDate = new Date(kycData.dateOfBirth);
        const age = new Date().getFullYear() - birthDate.getFullYear();
        if (age < 18) {
            errors.push('Agent must be at least 18 years old');
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

// Sanitize user input
export const sanitizeInput = (input: string): string => {
    return input
        .replace(/[<>]/g, '') // Remove < and >
        .trim()
        .substring(0, 255); // Limit length
};

// Validate transaction amount against limits
export const validateTransactionLimits = (
    amount: number,
    countryCode: string,
    transactionType: 'CASHIN' | 'CASHOUT'
): { isValid: boolean; error?: string } => {

    // BCEAO limits for West Africa
    const BCEAO_LIMITS = {
        CASHIN: 1000000, // 1,000,000 XOF ~ 1,600 USD
        CASHOUT: 500000  // 500,000 XOF ~ 800 USD
    };

    // Convert limits based on currency (simplified)
    // In production, use proper currency conversion
    let limits = BCEAO_LIMITS;

    if (amount <= 0) {
        return { isValid: false, error: 'Amount must be positive' };
    }

    if (transactionType === 'CASHIN' && amount > limits.CASHIN) {
        return {
            isValid: false,
            error: `Cash-in amount exceeds limit of ${limits.CASHIN}`
        };
    }

    if (transactionType === 'CASHOUT' && amount > limits.CASHOUT) {
        return {
            isValid: false,
            error: `Cash-out amount exceeds limit of ${limits.CASHOUT}`
        };
    }

    return { isValid: true };
};

// Generate secure random string for transaction IDs
export const generateSecureId = (length: number = 16): string => {
    return crypto.randomBytes(length).toString('hex');
};