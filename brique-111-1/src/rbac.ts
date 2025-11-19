/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * RBAC (reuse from brique-111)
 */

import { Request, Response, NextFunction } from "express";

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const hasRole = user.roles.some((r: string) => roles.includes(r));

    if (!hasRole) {
      return res.status(403).json({
        error: "forbidden",
        required_roles: roles,
        user_roles: user.roles
      });
    }

    next();
  };
}



