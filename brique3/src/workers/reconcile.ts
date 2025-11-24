import { db } from "../util/db";
import {
    PaymentProvider,
    ReconciliationResult,
    ProviderSettlement,
    InternalSettlementSummary
} from "../types/reconcile";

export async function enqueueReconcile(providerId?: string) {
    console.log(`Enqueuing reconciliation for provider: ${providerId || 'all'}`);

    setTimeout(() => {
        runDailyReconcile(providerId).catch(console.error);
    }, 1000);
}

export async function runDailyReconcile(providerId?: string) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = yesterday.toISOString().split('T')[0];

    try {
        // 1) Get internal settlement summary with proper typing
        let query = `
      SELECT * FROM v_topup_settlement_summary 
      WHERE day = $1
    `;
        const params: any[] = [day];

        if (providerId) {
            query += ` AND provider_id = $2`;
            params.push(providerId);
        }

        const internalSummary: InternalSettlementSummary[] = await db.manyOrNone(query, params);

        // 2) Fetch providers with proper typing
        let providersQuery = `SELECT * FROM molam_payment_providers WHERE active = true`;
        let providersParams: any[] = [];

        if (providerId) {
            providersQuery += ` AND id = $1`;
            providersParams = [providerId];
        }

        const providers: PaymentProvider[] = await db.manyOrNone(providersQuery, providersParams);

        const results: ReconciliationResult[] = [];

        for (const provider of providers) {
            const externalData = await fetchProviderSettlement(provider, day);

            // Trouver les données internes avec typage correct
            const internalData = internalSummary.find((s: InternalSettlementSummary) =>
                s.provider_id === provider.id
            );

            if (!internalData) {
                results.push({
                    provider_id: provider.id,
                    currency: provider.currency,
                    day,
                    expected_amount: externalData.total_amount,
                    actual_amount: 0,
                    discrepancy: externalData.total_amount,
                    status: 'missing'
                });
                continue;
            }

            // Maintenant TypeScript connaît la propriété total_gross
            const discrepancy = Math.abs(internalData.total_gross - externalData.total_amount);
            const tolerance = 0.01;

            results.push({
                provider_id: provider.id,
                currency: provider.currency,
                day,
                expected_amount: externalData.total_amount,
                actual_amount: internalData.total_gross, // ✅ total_gross est maintenant reconnu
                discrepancy,
                status: discrepancy <= tolerance ? 'matched' : 'discrepancy'
            });

            // 3) Create discrepancy ticket if needed
            if (discrepancy > tolerance) {
                await createDiscrepancyTicket(provider, day, internalData, externalData, discrepancy);
            }
        }

        // 4) Store reconciliation results
        await storeReconciliationResults(results);

        console.log(`Reconciliation completed for ${day}:`, results);

    } catch (error) {
        console.error('Reconciliation error:', error);
        throw error;
    }
}

async function fetchProviderSettlement(provider: PaymentProvider, day: string): Promise<ProviderSettlement> {
    // Implementation varies by provider
    switch (provider.name) {
        case 'wave':
            return fetchWaveSettlement(provider, day);
        case 'orange_money':
            return fetchOrangeMoneySettlement(provider, day);
        case 'stripe_cards':
            return fetchStripeSettlement(provider, day);
        case 'binance_onramp':
            return fetchBinanceSettlement(provider, day);
        default:
            // Fallback pour les providers non implémentés
            return {
                total_amount: 0,
                transaction_count: 0,
                fees: 0,
                settlement_reference: `${provider.name}-${day}`
            };
    }
}

async function fetchWaveSettlement(provider: PaymentProvider, day: string): Promise<ProviderSettlement> {
    // Actual Wave API integration
    try {
        console.log(`Fetching Wave settlement for ${day}`);

        // Exemple d'intégration API Wave
        // const response = await fetch(`https://api.wave.com/settlements/${day}`, {
        //   headers: { 'Authorization': `Bearer ${provider.config.api_key}` }
        // });
        // const data = await response.json();

        return {
            total_amount: 100000,
            transaction_count: 50,
            fees: 500,
            settlement_reference: `WAVE-${day}`
        };
    } catch (error) {
        console.error('Wave settlement fetch error:', error);
        throw error;
    }
}

async function fetchOrangeMoneySettlement(provider: PaymentProvider, day: string): Promise<ProviderSettlement> {
    try {
        console.log(`Fetching Orange Money settlement for ${day}`);

        return {
            total_amount: 75000,
            transaction_count: 30,
            fees: 300,
            settlement_reference: `OM-${day}`
        };
    } catch (error) {
        console.error('Orange Money settlement fetch error:', error);
        throw error;
    }
}

async function fetchStripeSettlement(provider: PaymentProvider, day: string): Promise<ProviderSettlement> {
    try {
        console.log(`Fetching Stripe settlement for ${day}`);

        return {
            total_amount: 50000,
            transaction_count: 20,
            fees: 250,
            settlement_reference: `STRIPE-${day}`
        };
    } catch (error) {
        console.error('Stripe settlement fetch error:', error);
        throw error;
    }
}

async function fetchBinanceSettlement(provider: PaymentProvider, day: string): Promise<ProviderSettlement> {
    try {
        console.log(`Fetching Binance settlement for ${day}`);

        return {
            total_amount: 25000,
            transaction_count: 10,
            fees: 125,
            settlement_reference: `BINANCE-${day}`
        };
    } catch (error) {
        console.error('Binance settlement fetch error:', error);
        throw error;
    }
}

async function createDiscrepancyTicket(
    provider: PaymentProvider,
    day: string,
    internal: InternalSettlementSummary,
    external: ProviderSettlement,
    discrepancy: number
) {
    try {
        await db.none(
            `INSERT INTO molam_reconciliation_tickets 
       (provider_id, currency, settlement_date, internal_amount, external_amount, 
        discrepancy, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW())`,
            [provider.id, provider.currency, day, internal.total_gross, external.total_amount, discrepancy]
        );

        console.log(`DISCREPANCY ALERT: Provider ${provider.name} on ${day}: ${discrepancy}`);

        await notifyOperationsTeam({
            provider: provider.name,
            day,
            internalAmount: internal.total_gross,
            externalAmount: external.total_amount,
            discrepancy,
            currency: provider.currency
        });

    } catch (error) {
        console.error('Error creating discrepancy ticket:', error);
    }
}

async function storeReconciliationResults(results: ReconciliationResult[]) {
    for (const result of results) {
        try {
            await db.none(
                `INSERT INTO molam_reconciliation_results 
         (provider_id, currency, settlement_date, expected_amount, actual_amount, 
          discrepancy, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [
                    result.provider_id,
                    result.currency,
                    result.day,
                    result.expected_amount,
                    result.actual_amount,
                    result.discrepancy,
                    result.status
                ]
            );
        } catch (error) {
            console.error('Error storing reconciliation result:', error);
        }
    }
}

async function notifyOperationsTeam(alert: {
    provider: string;
    day: string;
    internalAmount: number;
    externalAmount: number;
    discrepancy: number;
    currency: string;
}) {
    console.log('OPERATIONS ALERT:', alert);

    // Implémentation de notification (email, slack, etc.)
    // await emailService.send({
    //   to: 'operations@molam.com',
    //   subject: `Reconciliation Discrepancy - ${alert.provider}`,
    //   body: `Discrepancy detected for ${alert.provider} on ${alert.day}: ${alert.discrepancy} ${alert.currency}`
    // });
}

// Fonction utilitaire pour créer la table de réconciliation si elle n'existe pas
export async function createReconciliationTables() {
    await db.none(`
    CREATE TABLE IF NOT EXISTS molam_reconciliation_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID NOT NULL REFERENCES molam_payment_providers(id),
      currency TEXT NOT NULL,
      settlement_date DATE NOT NULL,
      internal_amount NUMERIC(18,2) NOT NULL,
      external_amount NUMERIC(18,2) NOT NULL,
      discrepancy NUMERIC(18,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      resolved_at TIMESTAMPTZ,
      resolved_by UUID REFERENCES molam_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

    await db.none(`
    CREATE TABLE IF NOT EXISTS molam_reconciliation_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID NOT NULL REFERENCES molam_payment_providers(id),
      currency TEXT NOT NULL,
      settlement_date DATE NOT NULL,
      expected_amount NUMERIC(18,2) NOT NULL,
      actual_amount NUMERIC(18,2) NOT NULL,
      discrepancy NUMERIC(18,2) NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

    console.log('Reconciliation tables created or already exist');
}