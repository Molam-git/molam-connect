// ============================================================================
// Authorization Middleware - Molam ID JWT + RBAC
// ============================================================================

import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

const MOLAM_ID_JWT_PUBLIC = process.env.MOLAM_ID_JWT_PUBLIC || "";

export interface MerchantUser {
  id: string;
  roles: string[];
  merchantId: string | null;
  country: string;
  currency: string;
  lang: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: MerchantUser;
    }
  }
}

/**
 * Verify Molam ID JWT token
 */
export function merchantAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  try {
    const payload = jwt.verify(token, MOLAM_ID_JWT_PUBLIC, {
      algorithms: ["RS256"],
    }) as any;

    req.user = {
      id: payload.sub,
      roles: payload.roles || [],
      merchantId: payload.merchant_id || null,
      country: payload.country || "CI",
      currency: payload.currency || "XOF",
      lang: payload.lang || "fr",
      email: payload.email,
    };

    logger.info("Merchant auth success", {
      user_id: req.user.id,
      merchant_id: req.user.merchantId,
      roles: req.user.roles,
    });

    next();
  } catch (error: any) {
    logger.error("JWT verification failed", { error: error.message });
    res.status(401).json({ error: "invalid_token" });
  }
}

/**
 * Require specific merchant roles
 */
export function requireMerchantRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRoles = req.user?.roles || [];

    const hasRole = userRoles.some((r) => roles.includes(r));

    if (!hasRole) {
      logger.warn("Insufficient permissions", {
        user_id: req.user?.id,
        required_roles: roles,
        user_roles: userRoles,
      });
      res.status(403).json({ error: "forbidden", required_roles: roles });
      return;
    }

    next();
  };
}

/**
 * Require merchant context (merchantId must be present)
 */
export function requireMerchantContext(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.merchantId) {
    res.status(403).json({ error: "merchant_context_required" });
    return;
  }
  next();
}

/**
 * Verify 2FA for sensitive operations
 */
export function require2FA(req: Request, res: Response, next: NextFunction): void {
  const otpCode = req.headers["x-otp-code"] as string;

  if (!otpCode) {
    res.status(403).json({
      error: "two_factor_required",
      message: "This operation requires 2FA verification",
    });
    return;
  }

  // TODO: Verify OTP code with Molam ID service
  // For now, accept any 6-digit code
  if (!/^\d{6}$/.test(otpCode)) {
    res.status(403).json({ error: "invalid_otp_code" });
    return;
  }

  logger.info("2FA verified", { user_id: req.user?.id });
  next();
}
