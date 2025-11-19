/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Audit logging utility (reuse from brique-111 or create new)
 */

import { pool } from "../db";
import { Request } from "express";

export interface AuditLog {
  merchant_id: string;
  merchant_plugin_id?: string;
  actor_id?: string;
  actor_type: "merchant" | "ops" | "sira" | "system";
  action: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

export async function logAudit(log: AuditLog): Promise<string> {
  try {
    const { rows } = await pool.query(
      `SELECT log_plugin_audit($1, $2, $3, $4, $5, $6, $7, $8) as id`,
      [
        log.merchant_id,
        log.merchant_plugin_id || null,
        log.actor_id || null,
        log.actor_type,
        log.action,
        JSON.stringify(log.details || {}),
        log.ip_address || null,
        log.user_agent || null
      ]
    );

    return rows[0].id;
  } catch (error: any) {
    console.error("Failed to log audit:", error);
    throw error;
  }
}

export function getAuditContext(req: Request): {
  actor_id?: string;
  actor_type: "merchant" | "ops" | "sira" | "system";
  ip_address?: string;
  user_agent?: string;
} {
  const user = req.user;
  
  let actor_type: "merchant" | "ops" | "sira" | "system" = "system";
  if (user) {
    if (user.roles.includes("pay_admin") || user.roles.includes("compliance_ops")) {
      actor_type = "ops";
    } else if (user.roles.includes("merchant_admin")) {
      actor_type = "merchant";
    } else if (user.roles.includes("sira")) {
      actor_type = "sira";
    }
  }

  return {
    actor_id: user?.id,
    actor_type,
    ip_address: req.ip || req.socket.remoteAddress,
    user_agent: req.headers["user-agent"]
  };
}



