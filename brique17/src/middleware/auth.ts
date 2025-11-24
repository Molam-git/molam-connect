import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authUserJWT = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "User authentication required" });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, process.env.USER_JWT_SECRET!);
        (req as any).user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid user token" });
    }
};

export const authAgentJWT = (req: Request, res: Response, next: NextFunction) => {
    const agentToken = req.headers['x-agent-jwt'] as string;

    if (!agentToken) {
        return res.status(401).json({ error: "Agent authentication required" });
    }

    try {
        const decoded = jwt.verify(agentToken, process.env.AGENT_JWT_SECRET!);
        (req as any).agent = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid agent token" });
    }
};