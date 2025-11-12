/**
 * Brique 43 - Checkout Orchestration
 * Authorization Middleware (Molam ID JWT + Merchant API Keys)
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "./db";
import { verifyApiKeySecret } from "./crypto";

export interface AuthContext {
  type: "jwt" | "api_key";
  merchant_id: string;
  roles: string[];
  lang: string;
  currency: string;
  country: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Authentication middleware
 * Supports:
 * 1. Molam ID JWT (Bearer token) - preferred
 * 2. Merchant API Key (X-Merchant-Key header) - server-to-server
 */
export async function authzMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Try Molam ID JWT first
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const publicKey = (process.env.MOLAM_ID_JWT_PUBLIC || "").replace(/\\n/g, "\n");

      if (!publicKey) {
        throw new Error("MOLAM_ID_JWT_PUBLIC not configured");
      }

      const payload: any = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        issuer: "molam-id",
      });

      req.auth = {
        type: "jwt",
        merchant_id: payload.merchant_id || payload.sub,
        roles: payload.roles || ["merchant"],
        lang: payload.lang || payload.locale?.split("-")[0] || "en",
        currency: payload.currency || "USD",
        country: payload.country || "US",
      };

      return next();
    } catch (error: any) {
      console.error("JWT verification failed:", error.message);
      // Fall through to try API key
    }
  }

  // Try Merchant API Key
  const apiKeyHeader = req.headers["x-merchant-key"] as string;
  if (apiKeyHeader) {
    try {
      const [id, secret] = apiKeyHeader.split(".");
      if (!id || !secret) {
        throw new Error("Invalid API key format");
      }

      const { rows } = await pool.query(
        `SELECT k.id, k.key_hash, k.scope, m.id as merchant_id, m.default_lang, m.default_currency, m.country
         FROM merchant_api_keys k
         JOIN merchants m ON m.id = k.merchant_id
         WHERE k.id = $1 AND m.status = 'active'`,
        [id]
      );

      if (rows.length === 0) {
        throw new Error("API key not found");
      }

      const keyData = rows[0];
      const isValid = verifyApiKeySecret(secret, keyData.key_hash);

      if (!isValid) {
        throw new Error("Invalid API key secret");
      }

      // Update last used timestamp
      await pool.query("UPDATE merchant_api_keys SET last_used_at = now() WHERE id = $1", [id]);

      req.auth = {
        type: "api_key",
        merchant_id: keyData.merchant_id,
        roles: ["merchant", ...keyData.scope],
        lang: keyData.default_lang || "en",
        currency: keyData.default_currency || "USD",
        country: keyData.country || "US",
      };

      return next();
    } catch (error: any) {
      console.error("API key verification failed:", error.message);
      res.status(401).json({ error: "invalid_api_key" });
      return;
    }
  }

  // No valid authentication
  res.status(401).json({ error: "unauthorized", message: "No valid authentication provided" });
}

/**
 * Require specific scopes (for API keys)
 */
export function requireMerchantScope(scopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;

    if (!auth) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // JWT always has full access
    if (auth.type === "jwt") {
      return next();
    }

    // Check API key scopes
    const hasRequiredScope = scopes.some((scope) => auth.roles.includes(scope));

    if (!hasRequiredScope) {
      return res.status(403).json({
        error: "forbidden",
        message: `Required scope: ${scopes.join(" or ")}`,
      });
    }

    next();
  };
}
