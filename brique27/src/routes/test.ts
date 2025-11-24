import { Router } from 'express';
import { requireRole } from '../utils/authz';
import { renderTemplates } from '../services/templating';
import { chooseChannels } from '../services/routing';
import { resolveUserContext } from '../services/molamId';
import { enrichAmounts } from '../services/fx';

export const testRouter = Router();

testRouter.post('/', requireRole(['pay_admin', 'auditor']), async (req: any, res) => {
    const { event_type, user_id, payload } = req.body;

    try {
        const ctx = await resolveUserContext(user_id);
        const money = await enrichAmounts(payload, ctx.currency);
        const channels = await chooseChannels(event_type, ctx);
        const rendered = await renderTemplates(event_type, channels, ctx.lang, { ...payload, ...money, ctx });

        res.json({
            user_context: ctx,
            channels,
            rendered_templates: rendered
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});