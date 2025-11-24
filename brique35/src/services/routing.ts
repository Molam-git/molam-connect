import { getRoutingDecision } from "./sira";

interface RoutingDecision {
    bank_profile_id: string;
    treasury_account_id: string;
    bank_fee: number;
    estimated_settlement_time: number;
}

export async function pickRouting(
    currency: string,
    amount: number,
    originModule: string
): Promise<RoutingDecision> {
    try {
        const siraDecision = await getRoutingDecision({
            currency,
            amount,
            origin_module: originModule,
            timestamp: new Date().toISOString()
        });

        return {
            bank_profile_id: siraDecision.bank_profile_id,
            treasury_account_id: siraDecision.treasury_account_id,
            bank_fee: siraDecision.estimated_fees || 0,
            estimated_settlement_time: siraDecision.estimated_settlement_minutes || 1440 // 24h default
        };
    } catch (error) {
        console.error("SIRA routing failed, using default:", error);

        // Fallback to default routing
        return {
            bank_profile_id: process.env.DEFAULT_BANK_PROFILE_ID!,
            treasury_account_id: process.env.DEFAULT_TREASURY_ACCOUNT_ID!,
            bank_fee: 0,
            estimated_settlement_time: 1440
        };
    }
}