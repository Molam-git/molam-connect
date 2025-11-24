import { Request, Response, NextFunction } from 'express';
import { verifyHmacSignature } from '../utils/hmac';

export const webhookAuth = (req: Request, res: Response, next: NextFunction) => {
    // Vérifier la signature HMAC
    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    const nonce = req.headers['x-nonce'] as string;

    if (!signature || !timestamp || !nonce) {
        return res.status(401).json({ error: 'Missing authentication headers' });
    }

    // Vérifier le timestamp (par exemple, within 5 minutes)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
        return res.status(401).json({ error: 'Request too old' });
    }

    // Vérifier le nonce (pour éviter les replay attacks)
    // Ici, on peut utiliser un cache Redis ou en mémoire pour stocker les nonces déjà vus
    // Pour simplifier, on suppose une fonction checkNonce qui retourne true si le nonce n'a pas été utilisé
    if (!checkNonce(nonce)) {
        return res.status(401).json({ error: 'Nonce already used' });
    }

    // Vérifier la signature HMAC
    const payload = JSON.stringify(req.body);
    const isValid = verifyHmacSignature(payload, signature, timestamp, nonce);

    if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
};

// Fonction simplifiée pour vérifier le nonce (à implémenter avec un cache en production)
function checkNonce(nonce: string): boolean {
    // Implémentation basique : toujours vrai. En production, utiliser un cache (Redis) pour stocker les nonces pendant un certain temps.
    return true;
}