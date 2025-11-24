import { Router, Request, Response } from "express";
import { generateBatch, approveBatch, executeBatch, getBatch } from "../services/agentSettlements";

const router = Router();

// Génération d'un lot
router.post("/agents/:agentId/settlements/generate", async (req: Request, res: Response) => {
    try {
        const { agentId } = req.params;
        const { startDate, endDate } = req.body;
        const batch = await generateBatch(Number(agentId), startDate, endDate);
        res.json(batch);
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la génération du batch" });
    }
});

// Récupérer un lot
router.get("/agents/settlements/:batchId", async (req: Request, res: Response) => {
    try {
        const batch = await getBatch(req.params.batchId);
        res.json(batch);
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la récupération du batch" });
    }
});

// Approbation
router.post("/agents/settlements/:batchId/approve", async (req: Request, res: Response) => {
    try {
        // Supposons que l'ID utilisateur vient du middleware d'authentification
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Utilisateur non authentifié" });
        }
        const result = await approveBatch(req.params.batchId, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de l'approbation du batch" });
    }
});

// Exécution (via Treasury)
router.post("/agents/settlements/:batchId/execute", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Utilisateur non authentifié" });
        }
        const result = await executeBatch(req.params.batchId, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de l'exécution du batch" });
    }
});

export default router;