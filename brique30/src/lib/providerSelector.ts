// src/lib/providerSelector.ts
import { pool } from "../db";

export async function selectProviderFor(country: string | null, lang: string) {
    const res = await pool.query(
        `SELECT * FROM tts_providers WHERE is_active=true
     AND ($1 = ANY(regions_supported) OR $2 = ANY(supported_langs) OR regions_supported IS NULL)
     ORDER BY (CASE WHEN $1 = ANY(regions_supported) THEN 0 ELSE 1 END), per_minute_usd ASC
     LIMIT 1`,
        [country, lang]
    );
    return res.rows[0] || null;
}