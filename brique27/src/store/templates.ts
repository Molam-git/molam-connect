import { pool } from "./db";

export async function fetchTemplate(eventType: string, lang: string, channel: string) {
    // Try the specific language and channel
    let query = `
    SELECT subject, body 
    FROM notification_templates 
    WHERE event_type = $1 AND lang = $2 AND channel = $3 AND is_active = true
    ORDER BY version DESC 
    LIMIT 1
  `;

    let { rows } = await pool.query(query, [eventType, lang, channel]);

    if (rows.length > 0) {
        return rows[0];
    }

    // Fallback to English
    if (lang !== 'en') {
        query = `
      SELECT subject, body 
      FROM notification_templates 
      WHERE event_type = $1 AND lang = 'en' AND channel = $2 AND is_active = true
      ORDER BY version DESC 
      LIMIT 1
    `;

        ({ rows } = await pool.query(query, [eventType, channel]));

        if (rows.length > 0) {
            return rows[0];
        }
    }

    // If still not found, try any language for the event and channel
    query = `
    SELECT subject, body 
    FROM notification_templates 
    WHERE event_type = $1 AND channel = $2 AND is_active = true
    ORDER BY version DESC 
    LIMIT 1
  `;

    ({ rows } = await pool.query(query, [eventType, channel]));

    if (rows.length > 0) {
        return rows[0];
    }

    throw new Error(`No template found for event: ${eventType}, lang: ${lang}, channel: ${channel}`);
}