/**
 * Brique 51 - Refunds & Reversals
 * Authorization & Authentication Middleware
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || "molam-public-key";

export interface MolamUser {
  id: string;
  email: string;
  roles: string[];
  merchantId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: MolamUser;
    }
  }
}

/**
 * JWT authentication middleware
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ["RS256"] }) as any;

    req.user = {
      id: decoded.sub || decoded.user_id,
      email: decoded.email,
      roles: decoded.roles || [],
      merchantId: decoded.merchant_id,
    };

    next();
  } catch (err) {
    res.status(401).json({ error: "unauthorized", message: "Invalid token" });
    return;
  }
}

/**
 * Role-based access control middleware (variadic arguments)
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({ error: "forbidden", message: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export const authzMiddleware = authMiddleware;
