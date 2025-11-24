import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getUserLocaleProfile(userId: string) {
    const res = await db.query(`
    SELECT locale, currency, timezone, sira_risk, default_channels
    FROM user_locale_cache WHERE user_id = $1
  `, [userId]);
    return res.rows[0] ?? { locale: 'en', currency: 'USD', timeZone: 'UTC', defaultChannels: ['inapp', 'push'] };
}

export async function getTemplates(eventKey: string, channels: string[], locale: string) {
    const res = await db.query(`
    SELECT channel, subject_template, body_template
    FROM notification_templates
    WHERE event_key=$1 AND locale IN ($2, 'en') AND channel = ANY($3) AND is_active=TRUE
    ORDER BY CASE WHEN locale=$2 THEN 0 ELSE 1 END, version DESC
  `, [eventKey, locale, channels]);
    const map: any = {};
    for (const r of res.rows) if (!map[r.channel]) map[r.channel] = r;
    return map;
}

export async function getPreferences(userId: string, eventKey: string) {
    const res = await db.query(`
    SELECT event_key, channel, opted_in, quiet_hours_start, quiet_hours_end, dnd
    FROM notification_preferences
    WHERE user_id=$1 AND (event_key=$2 OR event_key='*')
  `, [userId, eventKey]);
    return res.rows;
}

export async function getPrimaryEndpoint(userId: string, channel: string) {
    const res = await db.query(`
    SELECT endpoint FROM user_channels WHERE user_id=$1 AND channel=$2 AND is_primary=TRUE AND is_verified=TRUE
    ORDER BY updated_at DESC LIMIT 1
  `, [userId, channel]);
    if (!res.rows[0]) throw Object.assign(new Error('No verified endpoint'), { code: 'NO_ENDPOINT' });
    return res.rows[0];
}