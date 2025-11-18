/**
 * Example Express webhook receiver
 *
 * Features:
 * - Verifies Molam-Signature header (t,v1,kid)
 * - Minimal idempotency & replay protection (in-memory cache for example)
 * - Emits events to local handler (could be Kafka)
 *
 * Production notes:
 * - Replace in-memory cache with Redis (SETNX with TTL) for replay protection
 * - Store secrets in Vault and rotate keys via webhook secrets endpoint
 */
import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";

export interface WebhookAppOpts {
  secret: string; // for demo; in prod fetch by kid
  allowClockSkewSec?: number;
}

function parseSignatureHeader(header: string | undefined) {
  if (!header) return null;
  try {
    const parts = Object.fromEntries(
      header.split(",").map(p => p.split("=", 2) as [string, string])
    );
    return { t: parts["t"], v1: parts["v1"], kid: parts["kid"] };
  } catch {
    return null;
  }
}

// Simple in-memory cache for demo; production -> Redis
const seenEvents = new Set<string>();

export function createWebhookApp(opts: WebhookAppOpts) {
  const app = express();

  // Raw body saver middleware
  function rawBodySaver(req: any, res: any, buf: Buffer) {
    (req as any).rawBody = buf.toString("utf8");
  }

  app.use(bodyParser.json({ limit: "1mb", verify: rawBodySaver }));

  app.post("/webhook", async (req: any, res) => {
    const sigHeader = req.header("Molam-Signature") || req.header("molam-signature");
    const sig = parseSignatureHeader(sigHeader);

    if (!sig) {
      return res.status(400).json({ error: "missing_signature" });
    }

    const ts = Number(sig.t);
    const skew = (opts.allowClockSkewSec ?? 300) * 1000;

    if (Math.abs(Date.now() - ts) > skew) {
      return res.status(400).json({ error: "timestamp_out_of_range" });
    }

    const raw = req.rawBody || JSON.stringify(req.body);
    const computed = crypto
      .createHmac("sha256", opts.secret)
      .update(`${sig.t}.${raw}`)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(sig.v1, "hex"), Buffer.from(computed, "hex"))) {
      return res.status(400).json({ error: "signature_mismatch" });
    }

    // Idempotency/replay protection
    const deliveryId = req.header("Idempotency-Key") || req.body?.id;
    if (!deliveryId) {
      return res.status(400).json({ error: "missing_delivery_or_id" });
    }

    if (seenEvents.has(deliveryId)) {
      return res.status(200).json({ ok: true, note: "already_processed" });
    }

    seenEvents.add(deliveryId);

    try {
      await handleEvent(req.body);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("handler failed", err);
      seenEvents.delete(deliveryId);
      return res.status(500).json({ error: "handler_failed" });
    }
  });

  // Health check
  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  return app;
}

async function handleEvent(evt: any) {
  const t = evt.type;
  switch (t) {
    case "payment.succeeded":
      console.log("Payment succeeded:", evt.data);
      break;
    case "refund.created":
      console.log("Refund created:", evt.data);
      break;
    default:
      console.log("Unhandled event type:", t);
  }
  // Simulate async work
  await new Promise(r => setTimeout(r, 10));
}

// Start server if run directly
if (require.main === module) {
  const secret = process.env.WEBHOOK_SECRET || "test_secret_key";
  const app = createWebhookApp({ secret });
  const port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log(`Webhook receiver listening on port ${port}`);
  });
}
