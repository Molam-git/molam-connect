import { Router } from 'express';
import { db } from '../shared/db';
import { requireScopes, requireRoleOrScopes } from '../shared/scopes';
import { buildFilters, buildKeysetPage, validateFilters } from './util';
import { exportCsv, exportPdf } from './exporter';
import { auditTrail } from '../shared/audit';
import fs from 'fs';

const router = Router();

/**
 * GET /api/pay/history/me
 * Historique du client (user)
 */
router.get('/me', requireScopes(['pay:tx:read:self']), async (req, res) => {
    try {
        const validationError = validateFilters(req.query);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        const userId = req.user!.id;
        const { whereSQL, params } = buildFilters({
            ...req.query,
            scope: 'user',
            userId
        });

        const { keysetSQL, keyParams } = buildKeysetPage(req.query);
        const limit = Math.min(Number(req.query.limit) || 50, 100);

        const queryText = `
      SELECT * FROM v_tx_history_enriched
      WHERE user_id = $1 ${whereSQL}
      ${keysetSQL}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length + keyParams.values.length + 1}
    `;

        const queryParams = [
            userId,
            ...params,
            ...keyParams.values,
            limit
        ];

        const result = await db.query(queryText, queryParams);

        await auditTrail(req, 'history_me_listed', {
            count: result.rowCount,
            filters: req.query
        });

        return res.json({ // ← AJOUT DE "return"
            items: result.rows,
            page: keyParams.pageInfo(result.rows)
        });

    } catch (error) {
        console.error('History me error:', error);
        return res.status(500).json({ error: 'internal_server_error' }); // ← AJOUT DE "return"
    }
});

/**
 * GET /api/pay/history/merchant
 * Historique d'un marchand
 */
router.get('/merchant', requireScopes(['pay:tx:read:merchant']), async (req, res) => {
    try {
        const validationError = validateFilters(req.query);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        const merchantId = req.user!.merchant_id!;
        const { whereSQL, params } = buildFilters({
            ...req.query,
            scope: 'merchant',
            merchantId
        });

        const { keysetSQL, keyParams } = buildKeysetPage(req.query);
        const limit = Math.min(Number(req.query.limit) || 50, 100);

        const queryText = `
      SELECT * FROM v_tx_history_enriched
      WHERE merchant_id = $1 ${whereSQL}
      ${keysetSQL}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length + keyParams.values.length + 1}
    `;

        const queryParams = [
            merchantId,
            ...params,
            ...keyParams.values,
            limit
        ];

        const result = await db.query(queryText, queryParams);

        await auditTrail(req, 'history_merchant_listed', {
            count: result.rowCount,
            merchant_id: merchantId,
            filters: req.query
        });

        return res.json({ // ← AJOUT DE "return"
            items: result.rows,
            page: keyParams.pageInfo(result.rows)
        });

    } catch (error) {
        console.error('History merchant error:', error);
        return res.status(500).json({ error: 'internal_server_error' }); // ← AJOUT DE "return"
    }
});

/**
 * GET /api/pay/history/admin
 * Admin/audit (multi-tenant, RBAC requis)
 */
router.get('/admin',
    requireRoleOrScopes(
        ['auditor', 'finance', 'pay_admin'],
        ['pay:tx:read:admin']
    ),
    async (req, res) => {
        try {
            const validationError = validateFilters(req.query);
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }

            const { whereSQL, params } = buildFilters({
                ...req.query,
                scope: 'admin'
            });

            const { keysetSQL, keyParams } = buildKeysetPage(req.query);
            const limit = Math.min(Number(req.query.limit) || 100, 500);

            const queryText = `
        SELECT * FROM v_tx_history_enriched
        WHERE 1=1 ${whereSQL}
        ${keysetSQL}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length + keyParams.values.length + 1}
      `;

            const queryParams = [
                ...params,
                ...keyParams.values,
                limit
            ];

            const result = await db.query(queryText, queryParams);

            await auditTrail(req, 'history_admin_listed', {
                count: result.rowCount,
                actor_roles: req.user?.roles,
                filters: req.query
            });

            return res.json({ // ← AJOUT DE "return"
                items: result.rows,
                page: keyParams.pageInfo(result.rows)
            });

        } catch (error) {
            console.error('History admin error:', error);
            return res.status(500).json({ error: 'internal_server_error' }); // ← AJOUT DE "return"
        }
    }
);

/**
 * GET /api/pay/history/export
 * Export CSV ou PDF signé
 */
router.get('/export', requireScopes(['pay:tx:export']), async (req, res) => {
    try {
        const format = (req.query.format as string) || 'csv';
        const scope = (req.query.scope as string) || 'self';

        if (!['csv', 'pdf'].includes(format)) {
            return res.status(400).json({ error: 'Invalid format' });
        }

        if (!['self', 'merchant', 'admin'].includes(scope)) {
            return res.status(400).json({ error: 'Invalid scope' });
        }

        // Construction du contexte de filtrage
        const ctx: any = { ...req.query, scope };
        if (scope === 'self') {
            ctx.userId = req.user!.id;
        } else if (scope === 'merchant') {
            ctx.merchantId = req.user!.merchant_id;
        }
        // Pour admin, pas de restriction supplémentaire

        const { whereSQL, params } = buildFilters(ctx);

        const result = await db.query(
            `SELECT * FROM v_tx_history_enriched 
       WHERE 1=1 ${whereSQL} 
       ORDER BY created_at DESC, id DESC 
       LIMIT 5000`,
            params
        );

        await auditTrail(req, 'history_export', {
            format,
            scope,
            count: result.rowCount,
            filters: req.query
        });

        let filePath: string;

        if (format === 'csv') {
            filePath = await exportCsv(result.rows);
            res.setHeader('Content-Type', 'text/csv');
        } else {
            filePath = await exportPdf(result.rows, {
                title: `Molam Pay - Historique (${scope})`
            });
            res.setHeader('Content-Type', 'application/pdf');
        }

        const filename = `molam-history-${scope}-${Date.now()}.${format}`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        return res.download(filePath, filename, (err) => { // ← AJOUT DE "return"
            if (err) {
                console.error('Download error:', err);
            }
            // Nettoyage optionnel du fichier temporaire
            setTimeout(() => {
                fs.unlink(filePath, () => {
                    console.log(`Temporary file cleaned: ${filePath}`);
                });
            }, 30000);
        });

    } catch (error) {
        console.error('Export error:', error);
        return res.status(500).json({ error: 'export_failed' }); // ← AJOUT DE "return"
    }
});

export default router;