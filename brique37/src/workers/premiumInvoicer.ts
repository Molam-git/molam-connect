import { pool } from "../db";
import { publishEvent } from "../events";

export async function generatePremiumInvoices(): Promise<void> {
    const { rows: activePolicies } = await pool.query(`
    SELECT * FROM agent_insurance_policies 
    WHERE policy_status = 'active' 
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  `);

    for (const policy of activePolicies) {
        const periodStart = new Date().toISOString().split('T')[0];
        const periodEnd = calculatePeriodEnd(periodStart, policy.premium_period);

        const { rows: existingInvoices } = await pool.query(
            `SELECT id FROM agent_insurance_invoices 
       WHERE policy_id = $1 AND period_start = $2`,
            [policy.id, periodStart]
        );

        if (existingInvoices.length === 0) {
            const { rows: newInvoice } = await pool.query(
                `INSERT INTO agent_insurance_invoices 
         (policy_id, agent_id, period_start, period_end, amount, status) 
         VALUES ($1, $2, $3, $4, $5, 'pending') 
         RETURNING *`,
                [policy.id, policy.agent_id, periodStart, periodEnd, policy.premium_amount]
            );

            await publishEvent("agent.premium.invoice_created", {
                invoiceId: newInvoice[0].id,
                agentId: policy.agent_id,
                amount: policy.premium_amount,
                currency: policy.currency
            });
        }
    }
}

function calculatePeriodEnd(startDate: string, period: string): string {
    const start = new Date(startDate);
    let end = new Date(start);

    switch (period) {
        case 'daily':
            end.setDate(end.getDate() + 1);
            break;
        case 'weekly':
            end.setDate(end.getDate() + 7);
            break;
        case 'monthly':
            end.setMonth(end.getMonth() + 1);
            break;
        default:
            end.setDate(end.getDate() + 7);
    }

    return end.toISOString().split('T')[0];
}