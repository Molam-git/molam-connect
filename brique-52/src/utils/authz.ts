/**
 * Authorization middleware - RBAC via Molam ID JWT
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import fs from "fs";

const publicKey = fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH || "./keys/public.pem", "utf8");

export interface AuthRequest extends Request {
  user?: {
    id: string;
    merchantId?: string;
    roles: string[];
    [key: string]: any;
  };
}

export function authzMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: { message: "Unauthorized", type: "auth_required" } });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as any;
    req.user = {
      id: decoded.sub || decoded.user_id,
      merchantId: decoded.merchant_id,
      roles: decoded.roles || [],
      ...decoded,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: { message: "Invalid token", type: "invalid_token" } });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { message: "Unauthorized", type: "auth_required" } });
      return;
    }

    const hasRole = allowedRoles.some((role) => req.user!.roles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        error: {
          message: "Forbidden - insufficient permissions",
          type: "forbidden",
          required_roles: allowedRoles,
        },
      });
      return;
    }

    next();
  };
}
