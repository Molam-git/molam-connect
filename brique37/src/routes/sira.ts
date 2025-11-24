import express from 'express';

const router = express.Router();

// Webhook pour recevoir les recommandations de SIRA
router.post('/float/recommendations', async (req, res) => {
    const { agentId, recommendations } = req.body;

    // Traiter les recommandations de SIRA (ex: augmenter la réserve, suspendre la politique, etc.)
    // ...

    // Envoyer une réponse
    res.json({ received: true });
});

export default router;