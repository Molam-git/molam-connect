export interface User {
    id: string;
    email: string;
    phone: string;
    status: 'ACTIVE' | 'INACTIVE';
    kyc_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
    preferred_language: string;
    created_at: Date;
    updated_at: Date;
}

export interface Agent {
    id: string;
    user_id: string; // L'agent est aussi un utilisateur, mais peut-être une relation séparée
    business_name: string;
    kyc_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
    status: 'ACTIVE' | 'INACTIVE';
    float_balance: number;
    created_at: Date;
    updated_at: Date;
}

export interface UserOTP {
    id: string;
    user_id: string;
    code: string;
    expires_at: Date;
    used: boolean;
    created_at: Date;
    updated_at: Date;
}