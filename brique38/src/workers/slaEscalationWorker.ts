import { pool } from "../db";
import { publishEvent } from "../events";

export class SlaEscalationWorker {
    async checkSlaViolations() {
        const nearingSla = await pool.query(
            `SELECT * FROM disputes 
       WHERE status NOT IN ('resolved','dismissed') 
       AND sla_due < NOW() + INTERVAL '1 hour'`
        );

        for (const dispute of nearingSla.rows) {
            await this.escalateDispute(dispute);
        }
    }

    private async escalateDispute(dispute: any) {
        await pool.query(
            `INSERT INTO dispute_escalations (dispute_id, escalated_by, reason, level) 
       VALUES ($1,'system','SLA nearing violation',1)`,
            [dispute.id]
        );

        await pool.query(
            `UPDATE disputes SET status='escalated', priority='high' WHERE id=$1`,
            [dispute.id]
        );

        await publishEvent("dispute.escalated", {
            disputeId: dispute.id,
            reason: "SLA nearing violation"
        });
    }
}