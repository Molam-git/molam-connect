import { db } from '../utils/database';

export const notificationService = {
    async sendCashinConfirmation(
        userId: string,
        agentId: string,
        amount: number,
        currency: string,
        transactionId: string
    ) {
        // Récupérer la langue préférée de l'utilisateur
        const userResult = await db.query(
            `SELECT preferred_language FROM molam_users WHERE id = $1`,
            [userId]
        );

        const lang = userResult.rows[0]?.preferred_language || 'fr';

        // Messages selon la langue
        const messages: { [key: string]: string } = {
            fr: `Dépôt de ${amount} ${currency} effectué avec succès. Transaction: ${transactionId}`,
            en: `Deposit of ${amount} ${currency} successful. Transaction: ${transactionId}`
        };

        const message = messages[lang] || messages['en'];

        // Insérer la notification pour l'utilisateur
        await db.query(
            `INSERT INTO notifications (user_id, type, message, lang)
             VALUES ($1, 'CASHIN', $2, $3)`,
            [userId, message, lang]
        );

        // Notification pour l'agent (supposons que l'agent a aussi un user_id)
        const agentMessage = `Cash-in de ${amount} ${currency} pour l'utilisateur ${userId}. Transaction: ${transactionId}`;
        await db.query(
            `INSERT INTO notifications (user_id, type, message, lang)
             VALUES ((SELECT user_id FROM agents WHERE id = $1), 'AGENT_CASHIN', $2, $3)`,
            [agentId, agentMessage, lang]
        );
    }
};