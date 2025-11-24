import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { cashinService } from '../services/cashinService';
import { notificationService } from '../services/notificationService';
import { auditService } from '../services/auditService';

export const cashinController = {
    async processCashin(req: Request, res: Response) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { agentId } = req.params;
        const { amount, currency, otp } = req.body;
        const userId = (req as any).user.sub;
        const agentJWT = (req as any).agent;

        try {
            // Valider l'OTP
            const otpValid = await cashinService.validateOTP(userId, otp);
            if (!otpValid) {
                await auditService.logFailedAttempt(userId, agentId, 'INVALID_OTP');
                return res.status(401).json({ error: "Invalid OTP" });
            }

            // Vérifier que l'agent est KYC validé
            const agentValid = await cashinService.validateAgentKYC(agentId);
            if (!agentValid) {
                await auditService.logFailedAttempt(userId, agentId, 'AGENT_NOT_KYC');
                return res.status(403).json({ error: "Agent not KYC verified" });
            }

            // Exécuter la transaction
            const transactionId = await cashinService.executeCashin(
                agentId,
                userId,
                amount,
                currency
            );

            // Envoyer les notifications
            await notificationService.sendCashinConfirmation(
                userId,
                agentId,
                amount,
                currency,
                transactionId
            );

            // Log d'audit réussi
            await auditService.logSuccessfulTransaction(
                transactionId,
                userId,
                agentId,
                amount,
                currency,
                req.ip,
                req.get('User-Agent')
            );

            res.status(201).json({
                txId: transactionId,
                status: "SUCCESS",
                message: "Cash-in processed successfully"
            });

        } catch (error: any) {
            console.error('Cash-in error:', error);

            // Log d'erreur
            await auditService.logFailedAttempt(
                userId,
                agentId,
                error.message
            );

            res.status(500).json({
                error: "Cash-in failed",
                details: error.message
            });
        }
    },

    async getTransactionStatus(req: Request, res: Response) {
        const { transactionId } = req.params;

        try {
            const status = await cashinService.getTransactionStatus(transactionId);
            res.json({ transactionId, status });
        } catch (error: any) {
            res.status(404).json({ error: "Transaction not found" });
        }
    }
};