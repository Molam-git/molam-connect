// src/utils/phoneValidation.ts
export const validateE164 = (phoneNumber: string): boolean => {
    return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
};

export const formatPhoneNumber = (phoneNumber: string, countryCode: string): string => {
    // Logique de formatage selon le pays
    return phoneNumber;
};