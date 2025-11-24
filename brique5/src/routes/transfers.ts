import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { db } from "../utils/db";
import { requireAuth, requireScope } from "../security/authz";
import { v4 as uuid } from "uuid";
import { withIdempotency } from "../utils/idempotency";
import { siraEvaluateTransfer } from "../services/siraService";

const r = Router();

r.post(
  "/transfers",
  requireAuth(),
  requireScope("pay.transfer:create"),
  body("sender_wallet_id").isUUID(),
  body("receiver_wallet_id").isUUID(),
  body("currency").isLength({ min: 3, max: 3 }),
  body("amount").isFloat({ gt: 0 }),
  withIdempotency(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sender_wallet_id, receiver_wallet_id, currency, amount, metadata = {} } = req.body;
    const sender_id = (req as any).user.sub;

    const sender = await db.one(
      `SELECT * FROM molam_wallets WHERE id=$1 AND user_id=$2`,
      [sender_wallet_id, sender_id]
    );
    const receiver = await db.one(
      `SELECT * FROM molam_wallets WHERE id=$1`,
      [receiver_wallet_id]
    );

    if (sender.currency !== currency || receiver.currency !== currency) {
      return res.status(400).json({ error: "Currency mismatch" });
    }

    const user = await db.one(`SELECT kyc_level FROM molam_users WHERE id=$1`, [sender_id]);
    const limit = await db.oneOrNone(
      `SELECT * FROM molam_kyc_limits WHERE country_code=$1 AND currency=$2 AND kyc_level=$3`,
      [sender.country_code, currency, user.kyc_level || "P0"]
    );
    if (limit && Number(amount) > Number(limit.per_tx_max)) {
      return res.status(403).json({ error: "Exceeds per-transaction KYC limit" });
    }

    if (Number(sender.balance) < Number(amount)) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const sira = await siraEvaluateTransfer({
      sender_id,
      receiver_id: receiver.user_id,
      amount: Number(amount),
      currency,
      device: (req as any).device
    });
    if (sira.decision === "block") {
      return res.status(403).json({ error: "Transfer blocked by risk engine" });
    }

    const reference = `TRF-${Date.now()}-${uuid().slice(0, 8)}`;
    const trf = await db.one(
      `INSERT INTO molam_transfers
       (sender_id,sender_wallet_id,receiver_id,receiver_wallet_id,currency,amount,fee_amount,status,reference,idempotency_key,initiated_via,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,0,'pending',$7,$8,$9,$10)
       ON CONFLICT (sender_wallet_id, idempotency_key) DO UPDATE SET updated_at=NOW()
       RETURNING *`,
      [sender_id, sender_wallet_id, receiver.user_id, receiver_wallet_id, currency, amount,
        reference, (req as any).idempotencyKey, req.headers["x-client-via"] || "app", metadata]
    );

    return res.status(201).json({ transfer: trf });
  }
);

r.post("/transfers/:id/confirm", requireAuth(), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user_id = (req as any).user.sub;

  const trf = await db.oneOrNone(
    `SELECT * FROM molam_transfers WHERE id=$1 AND receiver_id=$2`,
    [id, user_id]
  );
  if (!trf) return res.status(404).json({ error: "Transfer not found" });
  if (trf.status !== "pending") return res.status(400).json({ error: "Invalid state" });

  const succeeded = await db.one(
    `UPDATE molam_transfers SET status='succeeded', updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id]
  );
  await db.none(`SELECT post_transfer_ledger($1)`, [id]);

  res.json({ transfer: succeeded });
});

r.post("/transfers/:id/cancel", requireAuth(), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user_id = (req as any).user.sub;

  const trf = await db.oneOrNone(
    `SELECT * FROM molam_transfers WHERE id=$1 AND sender_id=$2`,
    [id, user_id]
  );
  if (!trf) return res.status(404).json({ error: "Not found" });
  if (trf.status !== "pending") return res.status(400).json({ error: "Cannot cancel" });

  const cancelled = await db.one(
    `UPDATE molam_transfers SET status='cancelled', updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id]
  );
  res.json({ transfer: cancelled });
});

export default r;