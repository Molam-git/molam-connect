export async function requiresApproval(
    amount: number,
    currency: string,
    bankProfileId?: string
): Promise<boolean> {
    // Récupérer les seuils depuis la configuration (base de données ou variables d'environnement)
    const approvalThreshold = Number(process.env.APPROVAL_THRESHOLD || 10000);

    // Vérifier le seuil de montant
    if (amount >= approvalThreshold) {
        return true;
    }

    // Vérifier si le bankProfile nécessite une approbation (par exemple, nouveau profil)
    // À implémenter selon les règles métier

    return false;
}