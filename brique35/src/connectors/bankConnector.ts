import { BankResponse } from "../types/payout";

export async function sendToBank(payload: any): Promise<BankResponse> {
    const { amount, currency, beneficiary, reference, bank_profile_id } = payload;

    console.log(`🏦 Sending payout to bank:`, {
        amount,
        currency,
        beneficiary: beneficiary.name,
        reference,
        bank_profile_id
    });

    // Simulation du délai de traitement bancaire
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulation: 90% de succès, 10% d'échec
    const success = Math.random() < 0.9;

    if (success) {
        const providerRef = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        console.log(`✅ Bank transfer successful: ${providerRef}`);

        return {
            status: 'sent',
            provider_ref: providerRef,
            raw_response: {
                status: 'ACCEPTED',
                transaction_id: providerRef,
                timestamp: new Date().toISOString()
            }
        };
    } else {
        console.log(`❌ Bank transfer failed for: ${reference}`);

        return {
            status: 'failed',
            error_message: 'Bank API timeout',
            raw_response: {
                status: 'REJECTED',
                error_code: 'TIMEOUT',
                timestamp: new Date().toISOString()
            }
        };
    }
}

export async function getBankStatus(providerRef: string): Promise<any> {
    console.log(`📊 Checking bank status for: ${providerRef}`);

    await new Promise(resolve => setTimeout(resolve, 500));

    return {
        status: 'COMPLETED',
        settled_at: new Date().toISOString(),
        provider_ref: providerRef
    };
}