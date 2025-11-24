import { pool } from "../db";
import { publishEvent } from "../events";

export class RuleEngineWorker {
    async processNewDispute(disputeId: string) {
        const dispute = await this.getDispute(disputeId);
        const rules = await this.getActiveRules();

        for (const rule of rules) {
            if (await this.evaluateRule(rule.conditions, dispute)) {
                await this.executeRuleAction(rule.action, dispute);
                break;
            }
        }
    }

    private async evaluateRule(conditions: any, dispute: any): Promise<boolean> {
        // Implémentation de l'évaluation des règles
        if (conditions.type === 'duplicate') {
            return await this.checkDuplicateTransaction(
                dispute.transaction_id,
                conditions.window_mins,
                conditions.same_amount
            );
        }
        return false;
    }

    private async executeRuleAction(action: any, dispute: any) {
        if (action.action === 'auto_refund') {
            await publishEvent("dispute.auto_resolved", {
                disputeId: dispute.id,
                action: 'refund',
                refundPct: action.refund_pct
            });
        }
    }

    private async getDispute(disputeId: string) {
        const { rows } = await pool.query("SELECT * FROM disputes WHERE id=$1", [disputeId]);
        return rows[0];
    }

    private async getActiveRules() {
        const { rows } = await pool.query("SELECT * FROM dispute_rules WHERE active=true");
        return rows;
    }

    private async checkDuplicateTransaction(txnId: string, windowMins: number, sameAmount: boolean): Promise<boolean> {
        // Logique de détection de doublon
        return false;
    }
}