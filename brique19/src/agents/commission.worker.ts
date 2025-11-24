// src/agents/commission.worker.ts
import { Pool } from "pg";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

const pool = new Pool();

/**
 * Planifie automatiquement les statements:
 * - hebdo pour les agents configurés en weekly
 * - mensuel pour les agents configurés en monthly
 */
export async function runCommissionRollup(now = new Date()) {
    // Récupère la config agent (hebdo/mensuel) et devise principale
    const { rows: agents } = await pool.query(
        `SELECT agent_id, country_code, currencies[1] AS currency, 
            COALESCE(metadata->>'payout_frequency','WEEKLY') AS freq
       FROM molam_agents`
    );

    for (const a of agents) {
        const currency = a.currency || "XOF";
        let start, end;
        if (a.freq === "MONTHLY") {
            start = startOfMonth(now);
            end = endOfMonth(now);
        } else {
            start = startOfWeek(now, { weekStartsOn: 1 }); // Lundi
            end = endOfWeek(now, { weekStartsOn: 1 });
        }

        try {
            await pool.query(
                `SELECT fn_commission_lock_period($1,$2,$3::timestamptz,$4::timestamptz)`,
                [a.agent_id, currency, start.toISOString(), end.toISOString()]
            );
            // NB: on ne LOCK pas ici; Finance valide puis lock via API
        } catch (e) {
            // ignorer si déjà existant (unique constraint), log metr.
        }
    }
}