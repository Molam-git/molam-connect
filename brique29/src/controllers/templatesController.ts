import { Response } from 'express';
import { pool } from '../db';
import { renderTemplate, getActiveTemplate, validateTemplateVariables } from '../utils/templateEngine';
import { AuthRequest, Template, TemplateCreateRequest } from '../types';

export class TemplatesController {
    static async renderTemplate(req: AuthRequest, res: Response) {
        try {
            const { key } = req.params;
            const { lang = 'en', channel = 'sms', ...variables } = req.query;

            const template = await getActiveTemplate(key, lang as string, channel as string);

            if (!template) {
                return res.status(404).json({
                    error: 'template_not_found',
                    message: `No template found for key: ${key}, lang: ${lang}, channel: ${channel}`
                });
            }

            const renderedContent = renderTemplate(template.content, variables as Record<string, string | number>);

            res.json({
                rendered: renderedContent,
                template_key: template.template_key,
                channel: template.channel,
                lang: template.lang,
                version: template.version
            });
        } catch (error: any) {
            console.error('Template render error:', error);
            res.status(500).json({
                error: 'server_error',
                detail: error.message
            });
        }
    }

    static async createTemplate(req: AuthRequest, res: Response) {
        try {
            const { template_key, channel, lang, content, metadata = {} }: TemplateCreateRequest = req.body;
            const actorId = req.user?.id;

            if (!template_key || !channel || !lang || !content) {
                return res.status(400).json({ error: 'missing_required_fields' });
            }

            // Validate template variables
            const invalidVars = validateTemplateVariables(content);
            if (invalidVars.length > 0) {
                return res.status(400).json({
                    error: 'invalid_variables',
                    invalid_variables: invalidVars,
                    allowed_variables: ['amount', 'currency', 'user_name', 'transaction_id', 'balance', 'date', 'time', 'merchant', 'location', 'phone', 'email']
                });
            }

            // Get next version number
            const versionResult = await pool.query(
                `SELECT COALESCE(MAX(version), 0) + 1 as next_version 
         FROM notification_templates 
         WHERE template_key = $1 AND channel = $2 AND lang = $3`,
                [template_key, channel, lang]
            );
            const version = versionResult.rows[0].next_version;

            // Insert new template
            const insertResult = await pool.query(
                `INSERT INTO notification_templates 
         (template_key, channel, lang, version, content, metadata, created_by, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, false) 
         RETURNING *`,
                [template_key, channel, lang, version, content, metadata, actorId]
            );

            const newTemplate = insertResult.rows[0];

            // Audit log
            await pool.query(
                `INSERT INTO notification_templates_audit 
         (template_id, action, actor_id, snapshot) 
         VALUES ($1, 'created', $2, $3)`,
                [newTemplate.id, actorId, newTemplate]
            );

            res.status(201).json(newTemplate);
        } catch (error: any) {
            console.error('Create template error:', error);
            res.status(500).json({
                error: 'server_error',
                detail: error.message
            });
        }
    }

    static async activateTemplate(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const actorId = req.user?.id;

            // Get template
            const templateResult = await pool.query(
                'SELECT * FROM notification_templates WHERE id = $1',
                [id]
            );

            if (templateResult.rows.length === 0) {
                return res.status(404).json({ error: 'template_not_found' });
            }

            const template = templateResult.rows[0];

            // Deactivate all other versions
            await pool.query(
                `UPDATE notification_templates 
         SET is_active = false 
         WHERE template_key = $1 AND channel = $2 AND lang = $3`,
                [template.template_key, template.channel, template.lang]
            );

            // Activate this version
            await pool.query(
                `UPDATE notification_templates 
         SET is_active = true, updated_at = now() 
         WHERE id = $1`,
                [id]
            );

            // Audit log
            await pool.query(
                `INSERT INTO notification_templates_audit 
         (template_id, action, actor_id, snapshot) 
         VALUES ($1, 'activated', $2, $3)`,
                [id, actorId, template]
            );

            res.json({
                success: true,
                message: 'Template activated successfully',
                template: { ...template, is_active: true }
            });
        } catch (error: any) {
            console.error('Activate template error:', error);
            res.status(500).json({
                error: 'server_error',
                detail: error.message
            });
        }
    }

    static async listTemplates(req: AuthRequest, res: Response) {
        try {
            const { key, channel, lang } = req.query;

            let query = `
        SELECT * FROM notification_templates 
        WHERE 1=1
      `;
            const params: any[] = [];
            let paramCount = 0;

            if (key) {
                paramCount++;
                query += ` AND template_key = $${paramCount}`;
                params.push(key);
            }

            if (channel) {
                paramCount++;
                query += ` AND channel = $${paramCount}`;
                params.push(channel);
            }

            if (lang) {
                paramCount++;
                query += ` AND lang = $${paramCount}`;
                params.push(lang);
            }

            query += ` ORDER BY template_key, channel, lang, version DESC`;

            const result = await pool.query(query, params);
            res.json(result.rows);
        } catch (error: any) {
            console.error('List templates error:', error);
            res.status(500).json({
                error: 'server_error',
                detail: error.message
            });
        }
    }
}