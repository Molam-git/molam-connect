import { Router, Request, Response } from "express";
import { requireAuth, ensureWalletAccess } from "../middleware/auth";
import { z } from "zod";
import { CreateWalletSchema, UpdateWalletSchema } from "../schemas/wallet";
import * as repo from "../repositories/walletRepo";

export const walletsRouter = Router();

/**
 * POST /api/pay/wallets
 * Create (idempotent per user+currency). External users can only create for themselves.
 */
walletsRouter.post("/", requireAuth, ensureWalletAccess({ allowInternalRoles: ["pay_admin", "pay_ops"] }), async (req: Request, res: Response) => {
    const auth: any = (req as any).auth;
    const parsed = CreateWalletSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const body = parsed.data;
    // External user guard
    if (auth.userType === "external" && body.user_id !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
    }
    try {
        const wallet = await repo.createWallet({ ...body, actor_id: auth.userId });
        return res.status(201).json(wallet);
    } catch (e: any) {
        if (e.constraint === "uq_user_currency") {
            // race-safe fallback
            const existing = await repo.listWallets({ user_id: body.user_id, currency: body.currency, limit: 1, offset: 0 });
            return res.status(200).json(existing[0]);
        }
        return res.status(500).json({ error: "Server error", details: e.message });
    }
});

/**
 * GET /api/pay/wallets
 * List by filters. External users restricted to own wallets.
 */
walletsRouter.get("/", requireAuth, ensureWalletAccess({ allowInternalRoles: ["pay_admin", "auditor", "pay_ops"] }), async (req: any, res: Response) => {
    const auth = req.auth;
    const qp = {
        user_id: auth.userType === "external" ? auth.userId : (req.query.user_id as string | undefined),
        currency: req.query.currency as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };
    const wallets = await repo.listWallets(qp);
    res.json({ items: wallets, count: wallets.length });
});

/**
 * GET /api/pay/wallets/:id
 */
walletsRouter.get("/:id", requireAuth, ensureWalletAccess({ allowInternalRoles: ["pay_admin", "auditor", "pay_ops"] }), async (req: any, res: Response) => {
    const wallet = await repo.getWallet(req.params.id);
    if (!wallet) return res.status(404).json({ error: "Not found" });
    const auth = req.auth;
    if (auth.userType === "external" && wallet.user_id !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
    }
    res.json(wallet);
});

/**
 * PATCH /api/pay/wallets/:id
 * Update is_default / status / display_name.
 */
walletsRouter.patch("/:id", requireAuth, ensureWalletAccess({ allowInternalRoles: ["pay_admin", "pay_ops"] }), async (req: any, res: Response) => {
    const parsed = UpdateWalletSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const auth = req.auth;
    const wallet = await repo.getWallet(req.params.id);
    if (!wallet) return res.status(404).json({ error: "Not found" });

    if (auth.userType === "external" && wallet.user_id !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
    }

    try {
        const updated = await repo.updateWallet(req.params.id, { ...parsed.data, actor_id: auth.userId });
        res.json(updated);
    } catch (e: any) {
        return res.status(400).json({ error: "Bad Request", details: e.message });
    }
});