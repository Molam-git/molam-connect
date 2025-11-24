// src/routes/voice.ts
import { Router } from "express";
import { pool } from "../db";
import { requireRole } from "../utils/authz";
import { renderTemplate } from "../lib/templateEngine";
import { publishKafka } from "../lib/kafka";
import { selectProviderFor } from "../lib/providerSelector";

export const voiceRouter = Router();

voiceRouter.post("/send", async (req: any, res) => {
    try {
        const { user_id, template_key, vars = {}, prefer_voice = false } = req.body;

        const userRes = await pool.query(
            "SELECT id, language, country, phone, region FROM molam_users WHERE id=$1",
            [user_id]
        );
        if (!userRes.rows.length) return res.status(404).json({ error: "user_not_found" });
        const user = userRes.rows[0];

        const tplRes = await pool.query(
            `SELECT * FROM notification_templates WHERE template_key=$1 AND channel='voice' AND lang=$2 AND is_active=true ORDER BY version DESC LIMIT 1`,
            [template_key, user.language || 'en']
        );

        if (tplRes.rows.length === 0) {
            const fallback = await pool.query(
                `SELECT * FROM notification_templates WHERE template_key=$1 AND channel='voice' AND lang='en' AND is_active=true LIMIT 1`,
                [template_key]
            );
            if (!fallback.rows.length) return res.status(404).json({ error: "voice_template_missing" });
            tplRes.rows = fallback.rows;
        }
        const tpl = tplRes.rows[0];

        const text = renderTemplate(tpl.content, { ...vars, user_name: user.first_name || "" });

        const provider = await selectProviderFor(user.country, tpl.lang);
        if (!provider) return res.status(503).json({ error: "no_provider" });

        const evt = {
            user_id,
            phone: user.phone,
            provider_id: provider.id,
            text,
            template_id: tpl.id,
            country: user.country,
            region: user.region || null
        };
        await publishKafka("voice_send_requests", evt);

        return res.json({ ok: true });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

voiceRouter.post("/providers", requireRole(["notif_admin", "pay_admin"]), async (req: any, res) => {
    const { id, name, endpoint, per_minute_usd, supported_langs, regions_supported } = req.body;
    await pool.query(
        `INSERT INTO tts_providers(id,name,endpoint,per_minute_usd,supported_langs,regions_supported, is_active) 
     VALUES ($1,$2,$3,$4,$5,$6,true)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, endpoint=EXCLUDED.endpoint, 
     per_minute_usd=EXCLUDED.per_minute_usd, supported_langs=EXCLUDED.supported_langs, 
     regions_supported=EXCLUDED.regions_supported, is_active=true`,
        [id, name, endpoint, per_minute_usd, supported_langs, regions_supported]
    );
    res.json({ ok: true });
});