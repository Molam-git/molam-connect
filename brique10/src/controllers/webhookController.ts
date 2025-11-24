// src/controllers/webhookController.ts
import { Request, Response } from 'express';
import { TopupTransactionModel } from '../models/TopupTransaction';

export const webhookHandler = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    
    // Vérifier la signature HMAC
    if (!verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Traiter le webhook
    await TopupTransactionModel.updateStatus(
      payload.transaction_id,
      payload.status,
      payload.provider_reference
    );
    
    // Envoyer une notification à l'utilisateur
    // ...
    
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

function verifyWebhookSignature(req: Request): boolean {
  // Implémentation de la vérification HMAC
  const signature = req.headers['x-signature'] as string;
  const payload = JSON.stringify(req.body);
  
  // Vérifier la signature avec la clé secrète
  // ...
  return true; // Simplifié pour l'exemple
}