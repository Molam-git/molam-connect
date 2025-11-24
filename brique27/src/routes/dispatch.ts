import { Router } from 'express';
import { requireRole } from '../utils/authz';
import { insertOutbox } from '../store/outbox';
import { renderTemplates } from '../services/templating';
import { chooseChannels } from '../services/routing';
import { resolveUserContext } from '../services/molamId';
import { enrichAmounts } from '../services/fx';

export const dispatchRouter = Router();

dispatchRouter.post('/', requireRole(['pay_admin', 'auditor']), async (req: any, res) => {
    const { event_id, event_type, user_id, payload } = req.body;

    try {
        const ctx = await resolveUserContext(user_id);
        const money = await enrichAmounts(payload, ctx.currency);
        const channels = await chooseChannels(event_type, ctx);
        const rendered = await renderTemplates(event_type, channels, ctx.lang, { ...payload, ...money, ctx });

        for (const r of rendered) {
            await insertOutbox({
                event_id,
                user_id,
                event_type,
                channel: r.channel,
                lang: ctx.lang,
                currency: ctx.currency,
                payload: r.payload,
                rendered_subject: r.subject,
                rendered_body: r.body
            });
        }

        res.json({ success: true, channels: rendered.map(r => r.channel) });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});