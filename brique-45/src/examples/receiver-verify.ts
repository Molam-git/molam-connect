// ============================================================================
// Brique 45 - Webhooks Industriels
// Signature Verification Example (Receiver Side)
// ============================================================================

import crypto from "crypto";

/**
 * Verify Molam webhook signature
 *
 * Header format: Molam-Signature: t=<unix_ms>,v1=<hmac_hex>,kid=<key_version>
 * Message signed: t + "." + rawBody
 *
 * @param headers - HTTP headers
 * @param rawBody - Raw request body (Buffer)
 * @param getSecretByKid - Function to retrieve secret by key version
 * @returns true if signature is valid
 * @throws Error if signature is invalid or missing
 */
export function verifyMolamSignature(
  headers: any,
  rawBody: Buffer,
  getSecretByKid: (kid: string) => string
): boolean {
  const sig = headers["molam-signature"] as string;
  if (!sig) {
    throw new Error("missing signature");
  }

  // Parse signature components
  const parts = Object.fromEntries(
    sig.split(",").map((s) => s.split("=", 2) as [string, string])
  );

  const t = parts["t"];
  const v1 = parts["v1"];
  const kid = parts["kid"];

  if (!t || !v1 || !kid) {
    throw new Error("invalid signature header");
  }

  // Verify timestamp (5 minute tolerance to prevent replay attacks)
  const ts = Number(t);
  const now = Date.now();
  const tolerance = 5 * 60 * 1000; // 5 minutes

  if (Math.abs(now - ts) > tolerance) {
    throw new Error("timestamp outside tolerance");
  }

  // Get secret for this key version
  const secret = getSecretByKid(kid);

  // Compute expected signature
  const message = `${t}.${rawBody}`;
  const computed = crypto.createHmac("sha256", secret).update(message).digest("hex");

  // Timing-safe comparison
  if (!crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(computed, "hex"))) {
    throw new Error("signature mismatch");
  }

  return true;
}

/**
 * Example: Express middleware for webhook signature verification
 */
export function webhookSignatureMiddleware(
  getSecretByKid: (kid: string) => string
) {
  return (req: any, res: any, next: any) => {
    try {
      // Get raw body (must be Buffer, not parsed JSON)
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

      // Verify signature
      verifyMolamSignature(req.headers, rawBody, getSecretByKid);

      // Check idempotency (optional but recommended)
      const idempotencyKey = req.headers["idempotency-key"];
      if (idempotencyKey) {
        // TODO: Check if this delivery_id has been processed before
        // Store in cache (Redis) with 24h TTL to prevent replay
      }

      next();
    } catch (error: any) {
      console.error("Webhook signature verification failed:", error.message);
      res.status(401).json({ error: "invalid_signature", message: error.message });
    }
  };
}

/**
 * Example usage in a receiver app
 */
export function exampleReceiverUsage() {
  // Store your webhook secrets (received during endpoint creation or rotation)
  const secrets: Record<string, string> = {
    "1": "your-secret-v1-base64...",
    "2": "your-secret-v2-base64...", // After rotation, both keys are valid
  };

  // Function to retrieve secret by key version
  const getSecretByKid = (kid: string): string => {
    const secret = secrets[kid];
    if (!secret) {
      throw new Error(`Unknown key version: ${kid}`);
    }
    return secret;
  };

  // In your Express app:
  // app.post('/webhooks/molam',
  //   express.raw({ type: 'application/json' }), // Get raw body
  //   webhookSignatureMiddleware(getSecretByKid),
  //   (req, res) => {
  //     const event = JSON.parse(req.body.toString());
  //     console.log('Received webhook:', event.type, event.id);
  //
  //     // Process event...
  //
  //     res.status(200).json({ received: true });
  //   }
  // );
}

/**
 * Example: Standalone verification (for testing)
 */
export function testSignatureVerification() {
  const secret = "test-secret-base64";
  const body = Buffer.from(JSON.stringify({ id: "evt_123", type: "payment.succeeded" }));
  const t = Date.now().toString();

  // Create signature (sender side)
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const headers = {
    "molam-signature": `t=${t},v1=${v1},kid=1`,
  };

  // Verify signature (receiver side)
  try {
    const isValid = verifyMolamSignature(headers, body, (kid) => {
      if (kid === "1") return secret;
      throw new Error("Unknown kid");
    });

    console.log("Signature verification:", isValid ? "✅ PASSED" : "❌ FAILED");
  } catch (error: any) {
    console.error("Signature verification error:", error.message);
  }
}
