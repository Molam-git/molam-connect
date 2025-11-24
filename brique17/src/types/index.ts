// Types pour les requêtes et réponses

export interface CashinRequest {
    amount: number;
    currency: string;
    otp: string;
}

export interface CashinResponse {
    txId: string;
    status: string;
    message?: string;
}

export interface TransactionStatusResponse {
    transactionId: string;
    status: string;
}

// Types pour les JWT
export interface UserJWT {
    sub: string;
    email: string;
    // ... autres champs
}

export interface AgentJWT {
    sub: string;
    // ... autres champs
}

// Types pour les bases de données
export * from '../models/transactionModels';
export * from '../models/userModels';