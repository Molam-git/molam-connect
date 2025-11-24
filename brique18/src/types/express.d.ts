import * as express from 'express';

declare global {
    namespace Express {
        interface Request {
            client?: {
                authorized: boolean;
                // Vous pouvez ajouter d'autres propriétés TLS si nécessaire
                getPeerCertificate?: () => any;
                authorizedizationError?: Error;
            };
        }
    }
}