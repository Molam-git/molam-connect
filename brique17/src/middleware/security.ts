import { Request, Response, NextFunction } from 'express';
import { db } from '../utils/database';

export const checkAgentKYC = async (req: Request, res: Response, next: NextFunction) => {
    const agentId = (req as any).agent?.sub; // Supposons que l'ID de l'agent est dans le token JWT

    if (!agentId) {
        return res.status(401).json({ error: "Agent ID missing" });
    }

    try {
        const result = await db.query(
            `SELECT kyc_status FROM agents WHERE id = $1`,
            [agentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Agent not found" });
        }

        if (result.rows[0].kyc_status !== 'VERIFIED') {
            return res.status(403).json({ error: "Agent KYC not verified" });
        }

        next();
    } catch (error) {
        console.error('KYC check error:', error);
        res.status(500).json({ error: "Internal server error during KYC check" });
    }
};