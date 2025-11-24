// src/agents/utils/pricing.ts
import { Pool } from "pg";

export async function getPricing(db: Pool | any, q: {
    country_code: string; currency: string; kyc_level: string; op_type: string;
}) {
    const { rows } = await db.query(
        `SELECT * FROM molam_pricing_agents
     WHERE country_code=$1 AND currency=$2 AND kyc_level=$3 AND op_type=$4
       AND is_active=TRUE AND (valid_to IS NULL OR valid_to>NOW())
     ORDER BY valid_from DESC LIMIT 1`,
        [q.country_code, q.currency, q.kyc_level, q.op_type]
    );
    if (rows.length === 0) {
        // default: CASHIN_SELF -> FREE; others -> MIXED light
        return {
            fee_type: q.op_type === "CASHIN_SELF" ? "FREE" : "MIXED",
            percent_bp: 80,      // 0.80% (≈10% < Wave 0.9%)
            flat_minor: 0,
            min_fee_minor: 50,   // 50 XOF/centimes
            max_fee_minor: 0,
            agent_share_bp: 5000 // 50% of fee to agent (example, tunable)
        };
    }
    return rows[0];
}