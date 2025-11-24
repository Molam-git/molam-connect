// Stubs pour les opérations wallet - à connecter aux services réels

export async function walletBalance(userId: string, currency: string): Promise<number> {
    // Implémentation réelle à connecter au service Wallet
    return 12500.00;
}

export async function p2pPreviewFees(countryCode: string, amount: number): Promise<any> {
    const molamFee = Math.max(5, Math.round(amount * 0.01));
    return {
        totalFees: molamFee,
        breakdown: { molam: molamFee, partner: 0 }
    };
}

export async function p2pTransfer(input: {
    fromUserId: string;
    toMsisdn: string;
    amount: number;
    currency: string;
    feesPreview: any;
}): Promise<string> {
    // Implémentation réelle à connecter au service Payments
    return `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function cashinInit(
    userId: string,
    agentCode: string,
    amount: number,
    currency: string
): Promise<{ reference: string }> {
    return {
        reference: `CI-${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`
    };
}

export async function withdrawInit(
    userId: string,
    amount: number,
    currency: string
): Promise<string> {
    return `WD-${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;
}