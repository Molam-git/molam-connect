/**
 * Brique 115 - Plugin Versioning & Migration Strategy
 * Audit logging utility
 */

import { pool } from "../db";
import { Request } from "express";

export interface AuditLog {
  merchant_id: string;
  actor_id?: string;
  actor_type: "merchant" | "ops" | "system" | "plugin";
  action: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

export async function logAudit(log: AuditLog): Promise<string> {
  try {
    // In production, write to molam_audit_logs table
    // For now, log to console and optionally to DB
    const { rows } = await pool.query(
      `INSERT INTO molam_audit_logs 
       (tenant_id, actor_id, actor_type, action, details, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING id`,
      [
        log.merchant_id,
        log.actor_id || null,
        log.actor_type,
        log.action,
        JSON.stringify(log.details || {}),
        log.ip_address || null,
        log.user_agent || null
      ]
    ).catch(() => {
      // If table doesn't exist, just log
      console.log("Audit:", JSON.stringify(log));
      return { rows: [{ id: "mock-id" }] };
    });

    return rows[0].id;
  } catch (error: any) {
    console.error("Failed to log audit:", error);
    return "error";
  }
}

export function getAuditContext(req: Request): {
  actor_id?: string;
  actor_type: "merchant" | "ops" | "system" | "plugin";
  ip_address?: string;
  user_agent?: string;
} {
  const user = req.user;
  
  let actor_type: "merchant" | "ops" | "system" | "plugin" = "system";
  if (user) {
    if (user.roles.includes("ops_plugins") || user.roles.includes("pay_admin")) {
      actor_type = "ops";
    } else if (user.roles.includes("merchant_admin")) {
      actor_type = "merchant";
    }
  }

  return {
    actor_id: user?.id,
    actor_type,
    ip_address: req.ip || req.socket.remoteAddress,
    user_agent: req.headers["user-agent"]
  };
}

