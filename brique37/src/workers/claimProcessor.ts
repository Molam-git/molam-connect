import { pool } from "../db";
import { publishEvent } from "../events";

export async function processApprovedClaim(claimId: string): Promise<void> {
    // Récupérer le claim approuvé
    const { rows } = await pool.query(`SELECT * FROM agent_insurance_claims WHERE id=$1 AND status='approved'`, [claimId]);
    const claim = rows[0];

    if (!claim) {
        throw new Error(`Claim ${claimId} not found or not approved`);
    }

    // Appeler l'API Treasury pour effectuer le paiement
    // Ici, on simule l'appel à l'API Treasury
    // En réalité, on utiliserait une requête HTTP ou un SDK
    try {
        // Code pour appeler Treasury /payouts
        // ...

        // Si le paiement est réussi, mettre à jour le statut du claim
        await pool.query(`UPDATE agent_insurance_claims SET status='paid', paid_at=now() WHERE id=$1`, [claimId]);

        // Publier l'événement de paiement effectué
        await publishEvent("agent.claim.paid", { claimId, amount: claim.claim_amount, agentId: claim.agent_id });
    } catch (error) {
        // En cas d'erreur, loguer et peut-être réessayer plus tard
        console.error(`Failed to process payout for claim ${claimId}:`, error);
        throw error;
    }
}