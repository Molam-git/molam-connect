import { BankConnector, BankStatementLine } from './BankConnectorInterface';

export const sandboxBankConnector: BankConnector = {
    name: 'sandbox',

    async sendPayment(payout: any) {
        // Simulation d'envoi de paiement
        console.log('Sending payment to sandbox bank:', payout);
        // Simuler un succès après un délai
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
            status: 'sent',
            provider_ref: `sandbox-${Date.now()}`,
            details: { simulated: true }
        };
    },

    async getPaymentStatus(provider_ref: string) {
        return { status: 'settled', details: {} };
    },

    async uploadStatement(fileBuffer: Buffer, meta: any) {
        // Simuler l'upload d'un relevé
        return { imported_id: `sandbox-stmt-${Date.now()}` };
    },

    async parseStatement(imported_id: string): Promise<BankStatementLine[]> {
        // Retourner des lignes de relevé simulées
        return [
            {
                id: '1',
                bank_profile_id: 'sandbox-bank',
                statement_date: new Date(),
                value_date: new Date(),
                amount: 1000,
                currency: 'XOF',
                description: 'Test payment',
                reference: 'TEST-REF-123'
            }
        ];
    }
};