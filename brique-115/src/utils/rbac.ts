/**
 * Brique 115 - Plugin Versioning & Migration Strategy
 * Role-Based Access Control
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

