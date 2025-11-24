import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.sendStatus(401);
    }

    jwt.verify(token, process.env.MOLAM_ID_JWT_PUBLIC as string, (err: any, user: any) => {
        if (err) {
            return res.sendStatus(403);
        }
        (req as any).user = user;
        next();
    });
}