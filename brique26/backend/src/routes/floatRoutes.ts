import express from 'express';
import { Pool } from 'pg';
import { buildPlan } from '../sira/plan';
import { executePlan } from '../sira/execute';

const router = express.Router();

// Helper pour gérer les erreurs
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

// GET /api/float/positions?country=SN&currency=XOF
router.get('/positions', async (req, res) => {
    try {
        const pool: Pool = (req as any).db;
        const { country, currency } = req.query;

        const { rows } = await pool.query(`
      SELECT e.id, e.display_name as entity, e.country, e.currency,
             p.balance, p.available, r.min_level as threshold,
             CASE 
               WHEN p.available < r.min_level THEN 'critical'
               ELSE 'normal'
             END as status
      FROM float_entities e
      JOIN LATERAL (
        SELECT balance, available FROM float_positions fp
        WHERE fp.entity_id=e.id ORDER BY as_of DESC LIMIT 1
      ) p ON TRUE
      LEFT JOIN float_rules r ON r.entity_id=e.id
      WHERE e.status='active'
        AND ($1::text IS NULL OR e.country=$1)
        AND ($2::text IS NULL OR e.currency=$2)
    `, [country, currency]);

        res.json({ rows });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        res.status(500).json({ error: errorMessage });
    }
});

// GET /api/float/alerts?severity=critical
router.get('/alerts', async (req, res) => {
    try {
        const pool: Pool = (req as any).db;
        const { severity } = req.query;

        const { rows } = await pool.query(`
      SELECT a.*, e.display_name as entity_name
      FROM float_alerts a
      JOIN float_entities e ON e.id=a.entity_id
      WHERE ($1::text IS NULL OR a.severity=$1)
        AND a.acknowledged=false
      ORDER BY a.created_at DESC
    `, [severity]);

        res.json({ rows });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        res.status(500).json({ error: errorMessage });
    }
});

// GET /api/float/orders
router.get('/orders', async (req, res) => {
    try {
        const pool: Pool = (req as any).db;
        const { status } = req.query;

        const { rows } = await pool.query(`
      SELECT 
        ft.id,
        ft.amount,
        ft.currency,
        ft.status,
        ft.created_at,
        fe_from.display_name as from_entity,
        fe_to.display_name as to_entity
      FROM float_transfers ft
      JOIN float_entities fe_from ON fe_from.id = ft.from_entity_id
      JOIN float_entities fe_to ON fe_to.id = ft.to_entity_id
      WHERE ($1::text IS NULL OR ft.status = $1)
      ORDER BY ft.created_at DESC
    `, [status]);

        res.json({ rows });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        res.status(500).json({ error: errorMessage });
    }
});

// GET /api/float/plans
router.get('/plans', async (req, res) => {
    try {
        const pool: Pool = (req as any).db;
        const { status } = req.query;

        const { rows } = await pool.query(`
      SELECT 
        plan_id,
        COUNT(*) as order_count,
        SUM(amount) as total_amount,
        MIN(created_at) as created_at,
        MIN(status) as overall_status
      FROM float_transfers
      WHERE ($1::text IS NULL OR status = $1)
      GROUP BY plan_id
      ORDER BY MIN(created_at) DESC
    `, [status]);

        res.json({ rows });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        res.status(500).json({ error: errorMessage });
    }
});

// POST /api/float/rules/:entityId
router.post('/rules/:entityId', async (req, res) => {
    try {
        const pool: Pool = (req as any).db;
        const { entityId } = req.params;
        const { min_level, target_level, max_level } = req.body;

        await pool.query(`
      INSERT INTO float_rules (entity_id, min_level, target_level, max_level, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (entity_id) 
      DO UPDATE SET 
        min_level=$2, target_level=$3, max_level=$4, updated_at=now()
    `, [entityId, min_level, target_level, max_level]);

        res.json({ success: true });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        res.status(500).json({ error: errorMessage });
    }
});

// POST /api/float/plan
router.post('/plan', async (req, res) => {
    try {
        const pool: Pool = (req as any).db;
        const { country, currency, horizon_min } = req.body;

        const result = await buildPlan(pool, country, currency, horizon_min || 60);
        res.json(result);
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        res.status(500).json({ error: errorMessage });
    }
});

// POST /api/float/execute
router.post('/execute', async (req, res) => {
    try {
        const pool: Pool = (req as any).db;
        const { plan_id } = req.body;

        const result = await executePlan(pool, plan_id);
        res.json(result);
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        res.status(500).json({ error: errorMessage });
    }
});

// POST /api/float/ack_alert
router.post('/ack_alert', async (req, res) => {
    try {
        const pool: Pool = (req as any).db;
        const { alert_id } = req.body;
        const userId = (req as any).user?.id || 1; // From JWT, fallback pour les tests

        await pool.query(`
      UPDATE float_alerts 
      SET acknowledged=true, acknowledged_by=$1, acknowledged_at=now()
      WHERE id=$2
    `, [userId, alert_id]);

        res.json({ success: true });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        res.status(500).json({ error: errorMessage });
    }
});

// POST /api/float/sync-entities
router.post('/sync-entities', async (req, res) => {
    try {
        const pool: Pool = (req as any).db;

        // Synchroniser les agents depuis la brique 21
        // Ceci est un exemple - à adapter selon votre modèle de données réel
        const { rows: agents } = await pool.query(`
      INSERT INTO float_entities (entity_type, ref_id, country, currency, display_name, status)
      SELECT 
        'agent' as entity_type,
        a.id::text as ref_id,
        a.country,
        a.currency,
        a.name as display_name,
        'active' as status
      FROM agents a  -- Table hypothétique de la brique 21
      WHERE NOT EXISTS (
        SELECT 1 FROM float_entities fe 
        WHERE fe.entity_type = 'agent' AND fe.ref_id = a.id::text
      )
      RETURNING *
    `);

        res.json({
            success: true,
            synced: agents.length,
            message: `Synchronized ${agents.length} agents to float entities`
        });
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        res.status(500).json({ error: errorMessage });
    }
});

export default router;