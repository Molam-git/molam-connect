import { Request, Response } from 'express';
import { pool } from "../db";
import { createAuditEvent } from "../services/audit";
import { payoutQueue } from "../queues";

export async function approvePayoutHandler(req: Request, res: Response) {
    const { id } = req.params;
    const { decision, comments } = req.body; // decision: 'approved' or 'rejected'
    const approverId = req.user?.id;
    const approverRole = req.user?.roles[0]; // Prendre le premier rôle pour l'instant

    if (!decision || !['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: "invalid_decision" });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Vérifier que le payout existe et est en attente d'approbation
        const { rows } = await client.query(
            "SELECT * FROM payouts WHERE id = $1 FOR UPDATE",
            [id]
        );

        if (!rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "payout_not_found" });
        }

        const payout = rows[0];

        if (payout.status !== 'pending_approval') {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "payout_not_awaiting_approval" });
        }

        // Enregistrer la décision d'approbation
        await client.query(
            `INSERT INTO payout_approvals (payout_id, approver_id, approver_role, decision, comments)
       VALUES ($1, $2, $3, $4, $5)`,
            [id, approverId, approverRole, decision, comments]
        );

        if (decision === 'approved') {
            // Marquer comme approuvé et passer à 'pending' ou 'scheduled'
            const nextStatus = payout.scheduled_for ? 'scheduled' : 'pending';
            await client.query(
                "UPDATE payouts SET status = $1, approval_status = 'approved', updated_at = now() WHERE id = $2",
                [nextStatus, id]
            );

            // Créer un événement d'audit
            await createAuditEvent(id, 'approved', { approver: approverId, comments }, approverId);

            // Si le payout est programmé, il sera traité à sa date, sinon on l'ajoute à la queue
            if (!payout.scheduled_for) {
                await payoutQueue.add("payout:process", { payoutId: id }, { priority: payout.priority });
            }
        } else {
            // Rejet : marquer comme rejeté et annuler
            await client.query(
                "UPDATE payouts SET status = 'cancelled', approval_status = 'rejected', updated_at = now() WHERE id = $1",
                [id]
            );

            // Libérer le hold ledger
            // ... (appel à releaseLedgerHold)

            await createAuditEvent(id, 'rejected', { approver: approverId, comments }, approverId);
        }

        await client.query("COMMIT");

        res.json({ status: decision, payout_id: id });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Approval error:", error);
        res.status(500).json({ error: "approval_failed" });
    } finally {
        client.release();
    }
}