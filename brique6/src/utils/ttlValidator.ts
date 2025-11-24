// src/utils/ttlValidator.ts
export const isExpired = (expiresAt: Date): boolean => {
    return new Date() > expiresAt;
};