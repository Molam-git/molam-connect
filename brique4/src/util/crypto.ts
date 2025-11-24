// src/util/crypto.ts
import { Request, Response, NextFunction } from "express";
import { createHmac } from "crypto";

export async function signProviderCreate(provider: any, payload: any): Promise<string> {
    // Implémentation simplifiée: signer le payload avec le secret du provider
    const secret = provider.config.webhook_secret; // à récupérer depuis le vault
    const hmac = createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
}

export function verifyWebhook() {
    return (req: Request, res: Response, next: NextFunction) => {
        const providerName = req.params.providerName;
        // Récupérer le provider et son secret
        // const provider = ... (à récupérer depuis la base)
        // const secret = provider.config.webhook_secret;

        // Vérifier la signature
        const signature = req.headers["x-signature"] as string;
        const hmac = createHmac('sha256', "secret"); // utiliser le secret du provider
        hmac.update(JSON.stringify(req.body));
        const expectedSignature = hmac.digest('hex');

        if (signature !== expectedSignature) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        next();
    };
}