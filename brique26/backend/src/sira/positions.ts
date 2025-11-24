import { Pool } from "pg";
import { FloatPosition, PositionWithStatus } from "../models/floatModels";

export class PositionManager {
    constructor(private pool: Pool) { }

    // Mettre à jour une position
    async updatePosition(position: Omit<FloatPosition, 'as_of'>): Promise<FloatPosition> {
        const { rows } = await this.pool.query(`
      INSERT INTO float_positions (entity_id, as_of, balance, reserved, available, currency)
      VALUES ($1, NOW(), $2, $3, $4, $5)
      RETURNING *
    `, [position.entity_id, position.balance, position.reserved, position.available, position.currency]);

        return rows[0];
    }

    // Récupérer la dernière position d'une entité
    async getLatestPosition(entityId: number): Promise<FloatPosition | null> {
        const { rows } = await this.pool.query(`
      SELECT * FROM float_positions 
      WHERE entity_id = $1 
      ORDER BY as_of DESC 
      LIMIT 1
    `, [entityId]);

        return rows[0] || null;
    }

    // Récupérer toutes les positions avec statut
    async getPositionsWithStatus(country?: string, currency?: string): Promise<PositionWithStatus[]> {
        let query = `
      SELECT 
        e.id,
        e.display_name as entity_name,
        e.entity_type,
        e.country,
        e.currency,
        p.balance,
        p.reserved,
        p.available,
        p.as_of,
        r.min_level,
        r.target_level,
        r.max_level,
        CASE 
          WHEN p.available < r.min_level THEN 'critical'
          WHEN p.available > r.max_level THEN 'surplus'
          ELSE 'normal'
        END as status
      FROM float_entities e
      JOIN LATERAL (
        SELECT * FROM float_positions fp
        WHERE fp.entity_id = e.id 
        ORDER BY fp.as_of DESC LIMIT 1
      ) p ON TRUE
      LEFT JOIN float_rules r ON r.entity_id = e.id
      WHERE e.status = 'active'
    `;

        const params: any[] = [];
        let paramCount = 0;

        if (country) {
            paramCount++;
            query += ` AND e.country = $${paramCount}`;
            params.push(country);
        }

        if (currency) {
            paramCount++;
            query += ` AND e.currency = $${paramCount}`;
            params.push(currency);
        }

        query += ` ORDER BY e.entity_type, e.display_name`;

        const { rows } = await this.pool.query(query, params);
        return rows;
    }

    // Calculer les statistiques agrégées
    async getAggregateStats(country?: string, currency?: string): Promise<{
        total_balance: number;
        total_available: number;
        critical_count: number;
        surplus_count: number;
    }> {
        let query = `
      SELECT 
        SUM(p.balance) as total_balance,
        SUM(p.available) as total_available,
        COUNT(CASE WHEN p.available < r.min_level THEN 1 END) as critical_count,
        COUNT(CASE WHEN p.available > r.max_level THEN 1 END) as surplus_count
      FROM float_entities e
      JOIN LATERAL (
        SELECT balance, available FROM float_positions fp
        WHERE fp.entity_id = e.id 
        ORDER BY fp.as_of DESC LIMIT 1
      ) p ON TRUE
      LEFT JOIN float_rules r ON r.entity_id = e.id
      WHERE e.status = 'active'
    `;

        const params: any[] = [];
        let paramCount = 0;

        if (country) {
            paramCount++;
            query += ` AND e.country = $${paramCount}`;
            params.push(country);
        }

        if (currency) {
            paramCount++;
            query += ` AND e.currency = $${paramCount}`;
            params.push(currency);
        }

        const { rows } = await this.pool.query(query, params);
        return rows[0];
    }

    // Historique des positions
    async getPositionHistory(entityId: number, hours: number = 24): Promise<FloatPosition[]> {
        const { rows } = await this.pool.query(`
      SELECT * FROM float_positions 
      WHERE entity_id = $1 
        AND as_of >= NOW() - INTERVAL '${hours} hours'
      ORDER BY as_of ASC
    `, [entityId]);

        return rows;
    }
}