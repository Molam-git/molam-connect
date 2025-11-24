import { db } from '../db/knex.js';
import { createCycleForPeriod } from '../domain/payout.js';

export async function schedulePayoutCycles() {
    const now = new Date();

    // Trouver les agents avec préférences
    const preferences = await db('agent_payout_preferences').select('*');

    for (const pref of preferences) {
        try {
            const { frequency } = pref;
            let periodStart: Date, periodEnd: Date;

            if (frequency === 'WEEKLY') {
                // Lundi dernier à dimanche dernier
                const lastMonday = new Date(now);
                lastMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7);
                lastMonday.setHours(0, 0, 0, 0);

                const lastSunday = new Date(lastMonday);
                lastSunday.setDate(lastMonday.getDate() + 6);
                lastSunday.setHours(23, 59, 59, 999);

                periodStart = lastMonday;
                periodEnd = lastSunday;
            } else {
                // Mois précédent
                const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

                periodStart = firstDayLastMonth;
                periodEnd = lastDayLastMonth;
            }

            await createCycleForPeriod(
                pref.agent_id,
                pref.currency,
                frequency,
                periodStart.toISOString(),
                periodEnd.toISOString()
            );
        } catch (error) {
            console.error(`Error scheduling payout for agent ${pref.agent_id}:`, error);
        }
    }
}