import { Router, Request, Response } from "express";
import { Pool } from "pg";

type Role = "Agent" | "Ops" | "Finance" | "Admin";

export function createAgentDashboardRouter(pool: Pool) {
  const router = Router();

  const authMiddleware = (req: Request, res: Response, next: () => void) => {
    const role = (req.header("x-role") as Role) || "Agent";
    const agentId = req.header("x-agent-id") || req.query.agent_id?.toString();

    (req as any).user = {
      id: req.header("x-user-id"),
      role,
      agentId,
    };

    next();
  };

  const requireRole =
    (...allowed: Role[]) =>
    (req: Request, res: Response, next: () => void) => {
      const user = (req as any).user;

      if (!user || !allowed.includes(user.role)) {
        return res.status(403).json({ error: "Insufficient privileges" });
      }

      return next();
    };

  const resolveAgentId = (req: Request) => {
    const user = (req as any).user;
    if (req.params.id === "me") return user.agentId;
    return req.params.id;
  };

  router.get(
    "/agents/:id/sales",
    authMiddleware,
    requireRole("Agent", "Ops", "Finance", "Admin"),
    async (req: Request, res: Response) => {
      const agentId = resolveAgentId(req);

      const { rows } = await pool.query(
        `
        SELECT *
        FROM agent_sales
        WHERE agent_id = $1
        ORDER BY sale_date DESC
        LIMIT 100
      `,
        [agentId]
      );

      res.json(rows);
    }
  );

  router.get(
    "/agents/:id/float",
    authMiddleware,
    requireRole("Agent", "Ops", "Finance", "Admin"),
    async (req: Request, res: Response) => {
      const agentId = resolveAgentId(req);

      const { rows } = await pool.query(
        `
        SELECT *
        FROM agent_float
        WHERE agent_id = $1
        ORDER BY last_update DESC
        LIMIT 1
      `,
        [agentId]
      );

      res.json(rows[0] || null);
    }
  );

  router.get(
    "/agents/:id/commissions",
    authMiddleware,
    requireRole("Agent", "Finance", "Admin"),
    async (req: Request, res: Response) => {
      const agentId = resolveAgentId(req);

      const { rows } = await pool.query(
        `
        SELECT *
        FROM agent_commissions
        WHERE agent_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `,
        [agentId]
      );

      res.json(rows);
    }
  );

  return router;
}

