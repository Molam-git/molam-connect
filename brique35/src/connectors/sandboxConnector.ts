import { BankResponse } from "../types/payout";

export class SandboxConnector {
    async sendPayment(payload: any): Promise<BankResponse> {
        const { amount, currency, reference } = payload;

        console.log(`🧪 Sandbox: Processing payout ${reference} for ${amount} ${currency}`);

        // Délai simulé plus court pour les tests
        await new Promise(resolve => setTimeout(resolve, 300));

        // Pour le sandbox, on peut contrôler le succès/échec via un paramètre
        const forceFailure = payload.force_failure || false;

        if (forceFailure) {
            return {
                status: 'failed',
                error_message: 'Sandbox: Simulated failure',
                raw_response: { simulated: true, error: 'forced_failure' }
            };
        }

        const providerRef = `SANDBOX-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        console.log(`✅ Sandbox: Transfer completed - ${providerRef}`);

        return {
            status: 'sent',
            provider_ref: providerRef,
            raw_response: {
                simulated: true,
                amount: payload.amount,
                currency: payload.currency,
                reference: payload.reference
            }
        };
    }

    async getPaymentStatus(providerRef: string): Promise<any> {
        await new Promise(resolve => setTimeout(resolve, 100));

        return {
            status: 'COMPLETED',
            settled_at: new Date().toISOString(),
            provider_ref: providerRef,
            simulated: true
        };
    }
}

// Instance par défaut pour une utilisation facile
export const sandboxConnector = new SandboxConnector();