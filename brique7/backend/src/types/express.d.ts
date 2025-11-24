import { Request } from 'express';

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                phone_number?: string;
                email?: string;
                status?: string;
            };
        }
    }
}