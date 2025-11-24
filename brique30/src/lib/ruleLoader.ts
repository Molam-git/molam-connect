// src/lib/ruleLoader.ts
import { pool } from "../db";

export async function loadRule(country: string, region: string, city?: string) {
    const q = `
    SELECT * FROM voice_channel_rules
    WHERE (city=$1 OR city IS NULL)
      AND (country=$2 OR country IS NULL)
      AND (region=$3 OR region IS NULL)
    ORDER BY city DESC NULLS LAST, country DESC NULLS LAST, region DESC NULLS LAST
    LIMIT 1
  `;
    const { rows } = await pool.query(q, [city || null, country, region]);
    return rows[0] || {
        fallback_enabled: true,
        fallback_delay_seconds: 60,
        max_message_seconds: 60
    };
}