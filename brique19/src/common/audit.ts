// src/common/audit.ts
import { Pool } from "pg";

const pool = new Pool();

export interface AuditLog {
    actor_type: 'EMPLOYEE' | 'AGENT' | 'SYSTEM';
    actor_id?: number;
    action: string;
    target_id?: number;
    context: any;
    ip_address?: string;
    user_agent?: string;
}

export class AuditService {
    /**
     * Log une action d'audit avec hachage chaîné pour immuabilité
     */
    static async log(auditData: AuditLog): Promise<void> {
        const client = await pool.connect();

        try {
            // Récupère le dernier hash pour le chaînage
            const { rows: [lastHash] } = await client.query(
                `SELECT hash_curr FROM molam_audit_logs 
         ORDER BY log_id DESC LIMIT 1`
            );

            const previousHash = lastHash?.hash_curr || 'initial';
            const contextString = JSON.stringify(auditData.context);

            // Calcule le nouveau hash (chaîné)
            const { rows: [{ hash_curr }] } = await client.query(
                `SELECT encode(
          digest($1 || $2 || $3, 'sha256'), 
          'hex'
         ) as hash_curr`,
                [previousHash, auditData.action, contextString]
            );

            // Insère le log d'audit
            await client.query(
                `INSERT INTO molam_audit_logs 
         (actor_type, actor_id, action, target_id, context, ip_address, user_agent, hash_prev, hash_curr)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    auditData.actor_type,
                    auditData.actor_id,
                    auditData.action,
                    auditData.target_id,
                    auditData.context,
                    auditData.ip_address,
                    auditData.user_agent,
                    previousHash,
                    hash_curr
                ]
            );

        } finally {
            client.release();
        }
    }

    /**
     * Vérifie l'intégrité de la chaîne d'audit
     */
    static async verifyChain(): Promise<{ valid: boolean; brokenAt?: number }> {
        const { rows } = await pool.query(
            `SELECT log_id, hash_prev, hash_curr, action, context
       FROM molam_audit_logs 
       ORDER BY log_id ASC`
        );

        let previousHash = 'initial';

        for (const row of rows) {
            // Recalcule le hash attendu
            const contextString = JSON.stringify(row.context);
            const { rows: [{ computed_hash }] } = await pool.query(
                `SELECT encode(
          digest($1 || $2 || $3, 'sha256'), 
          'hex'
         ) as computed_hash`,
                [previousHash, row.action, contextString]
            );

            if (computed_hash !== row.hash_curr) {
                return { valid: false, brokenAt: row.log_id };
            }

            previousHash = row.hash_curr;
        }

        return { valid: true };
    }

    /**
     * Exporte les logs d'audit pour archivage WORM
     */
    static async exportForArchiving(startDate: Date, endDate: Date): Promise<any[]> {
        const { rows } = await pool.query(
            `SELECT * FROM molam_audit_logs 
       WHERE created_at >= $1 AND created_at <= $2 
       ORDER BY log_id ASC`,
            [startDate, endDate]
        );

        return rows;
    }
}

// Migration SQL pour la table d'audit (à ajouter si elle n'existe pas)
export const AUDIT_MIGRATION = `
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  log_id        BIGSERIAL PRIMARY KEY,
  actor_type    TEXT NOT NULL,      -- 'EMPLOYEE'|'AGENT'|'SYSTEM'
  actor_id      BIGINT,             -- ID de l'acteur (optionnel pour SYSTEM)
  action        TEXT NOT NULL,      -- Code d'action (ex: 'AGENT_COMM_ADJUST')
  target_id     BIGINT,             -- ID cible (ex: statement_id)
  context       JSONB NOT NULL,     -- Contexte détaillé de l'action
  ip_address    INET,               -- Adresse IP source
  user_agent    TEXT,               -- User-Agent si applicable
  hash_prev     TEXT NOT NULL,      -- Hash du log précédent (pour chaînage)
  hash_curr     TEXT NOT NULL,      -- Hash de ce log
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON molam_audit_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON molam_audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_target ON molam_audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_chain ON molam_audit_logs(hash_prev, hash_curr);
`;