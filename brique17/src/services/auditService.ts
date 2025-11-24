import { db } from '../utils/database';

export const auditService = {
    async logSuccessfulTransaction(
        transactionId: string,
        userId: string,
        agentId: string,
        amount: number,
        currency: string,
        ipAddress?: string,
        userAgent?: string
    ) {
        await db.query(
            `INSERT INTO cashin_audit_logs 
             (transaction_id, user_id, agent_id, amount, currency, status, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6, $7)`,
            [transactionId, userId, agentId, amount, currency, ipAddress, userAgent]
        );
    },

    async logFailedAttempt(
        userId: string,
        agentId: string,
        reason: string,
        ipAddress?: string,
        userAgent?: string
    ) {
        await db.query(
            `INSERT INTO cashin_audit_logs 
             (user_id, agent_id, amount, currency, status, failure_reason, ip_address, user_agent)
             VALUES ($1, $2, 0, '', 'FAILED', $3, $4, $5)`,
            [userId, agentId, reason, ipAddress, userAgent]
        );
    },

    async logSuspiciousActivity(
        transactionId: string,
        userId: string,
        agentId: string,
        amount: number,
        currency: string,
        reason: string,
        ipAddress?: string,
        userAgent?: string
    ) {
        await db.query(
            `INSERT INTO cashin_audit_logs 
             (transaction_id, user_id, agent_id, amount, currency, status, failure_reason, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, 'SUSPICIOUS', $6, $7, $8)`,
            [transactionId, userId, agentId, amount, currency, reason, ipAddress, userAgent]
        );
    }
};