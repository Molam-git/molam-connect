import { Pool } from "pg";
import { FloatRule } from "../models/floatModels";

export class RulesManager {
    constructor(private pool: Pool) { }

    // Récupérer les règles d'une entité
    async getRules(entityId: number): Promise<FloatRule | null> {
        const { rows } = await this.pool.query(`
      SELECT * FROM float_rules 
      WHERE entity_id = $1
    `, [entityId]);

        return rows[0] || null;
    }

    // Mettre à jour ou créer des règles
    async upsertRules(rules: Omit<FloatRule, 'updated_at'>): Promise<FloatRule> {
        const { rows } = await this.pool.query(`
      INSERT INTO float_rules (
        entity_id, min_level, target_level, max_level, 
        daily_growth_bp, volatility_bp, lead_minutes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (entity_id) 
      DO UPDATE SET 
        min_level = $2,
        target_level = $3,
        max_level = $4,
        daily_growth_bp = $5,
        volatility_bp = $6,
        lead_minutes = $7,
        updated_at = NOW()
      RETURNING *
    `, [
            rules.entity_id,
            rules.min_level,
            rules.target_level,
            rules.max_level,
            rules.daily_growth_bp,
            rules.volatility_bp,
            rules.lead_minutes
        ]);

        return rows[0];
    }

    // Récupérer les règles par pays/devise
    async getRulesByCountryCurrency(country: string, currency: string): Promise<(FloatRule & { entity_name: string; entity_type: string })[]> {
        const { rows } = await this.pool.query(`
      SELECT r.*, e.display_name as entity_name, e.entity_type
      FROM float_rules r
      JOIN float_entities e ON e.id = r.entity_id
      WHERE e.country = $1 AND e.currency = $2
        AND e.status = 'active'
    `, [country, currency]);

        return rows;
    }

    // Appliquer des règles par défaut basées sur le type d'entité
    async applyDefaultRules(entityId: number, entityType: string, currency: string): Promise<FloatRule> {
        // Règles par défaut basées sur le type d'entité
        const defaultRules: Record<string, Omit<FloatRule, 'entity_id' | 'updated_at'>> = {
            agent: {
                min_level: 1000,
                target_level: 5000,
                max_level: 20000,
                daily_growth_bp: 50,
                volatility_bp: 200,
                lead_minutes: 120
            },
            bank: {
                min_level: 50000,
                target_level: 200000,
                max_level: 1000000,
                daily_growth_bp: 100,
                volatility_bp: 500,
                lead_minutes: 60
            },
            mmo: {
                min_level: 100000,
                target_level: 500000,
                max_level: 2000000,
                daily_growth_bp: 150,
                volatility_bp: 300,
                lead_minutes: 30
            }
        };

        const rules = defaultRules[entityType] || defaultRules.agent;

        return await this.upsertRules({
            entity_id: entityId,
            ...rules
        });
    }

    // Valider les règles (min < target < max)
    validateRules(rules: Omit<FloatRule, 'updated_at'>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (rules.min_level >= rules.target_level) {
            errors.push('min_level must be less than target_level');
        }

        if (rules.target_level >= rules.max_level) {
            errors.push('target_level must be less than max_level');
        }

        if (rules.min_level < 0) {
            errors.push('min_level cannot be negative');
        }

        if (rules.daily_growth_bp < -1000 || rules.daily_growth_bp > 1000) {
            errors.push('daily_growth_bp must be between -1000 and 1000 basis points');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}