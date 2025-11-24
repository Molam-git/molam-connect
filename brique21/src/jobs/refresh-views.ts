import { db } from '../db/knex.js';
import { logger } from '../observability/logger.js';

async function refresh(name: string) {
    try {
        await db.raw(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${name}`);
        logger.info({ view: name }, 'refreshed');
    } catch (e) {
        logger.error({ err: e, view: name }, 'refresh failed');
    }
}

(async () => {
    await refresh('mv_agent_kpis_daily');
    await refresh('mv_agent_commissions_daily');
    await refresh('mv_agent_payouts_daily');
    process.exit(0);
})();