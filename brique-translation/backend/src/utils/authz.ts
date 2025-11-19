/**
 * BRIQUE TRANSLATION — RBAC Authorization Middleware
 * Integrates with Molam ID JWT tokens
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/**
 * requireRole(roles[]) middleware:
 * - verifies Authorization: Bearer <jwt>
 * - checks `roles` claim (array) or single `role`
 *
 * Molam ID public key expected in env MOLAM_ID_PUBLIC
 */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "missing_token" });
      }

      const token = auth.slice(7);
      const pub = process.env.MOLAM_ID_PUBLIC!;

      if (!pub) {
        console.error("MOLAM_ID_PUBLIC not configured");
        return res.status(500).json({ error: "server_misconfigured" });
      }

      const payload = jwt.verify(token, pub, {
        algorithms: ["RS256", "RS512", "ES256"]
      }) as any;

      const userRoles: string[] = payload.roles || (payload.role ? [payload.role] : []);
      const intersection = userRoles.filter(r => roles.includes(r));

      if (!intersection.length) {
        return res.status(403).json({ error: "forbidden", required_roles: roles });
      }

      (req as any).user = {
        id: payload.sub,
        roles: userRoles,
        raw: payload
      };

      next();
    } catch (e: any) {
      return res.status(401).json({ error: "invalid_token", detail: e.message });
    }
  };
}
