/**
 * Brique 51bis - Merchant Refund Policies & Zones
 * Zone Service
 */

import { pool } from "../../utils/db.js";

export interface Zone {
  id: string;
  code: string;
  name: string;
  description: string;
  metadata: any;
}

/**
 * Get all zones
 */
export async function listZones(): Promise<Zone[]> {
  const { rows } = await pool.query(`SELECT * FROM zones ORDER BY name ASC`);
  return rows;
}

/**
 * Get zone by code
 */
export async function getZoneByCode(code: string): Promise<Zone | null> {
  const { rows } = await pool.query(`SELECT * FROM zones WHERE code = $1`, [code]);
  return rows[0] || null;
}

/**
 * Get zone for country
 */
export async function getZoneForCountry(countryCode: string): Promise<Zone | null> {
  const { rows } = await pool.query(
    `SELECT z.* FROM zones z
     JOIN zone_countries zc ON z.id = zc.zone_id
     WHERE zc.country_code = $1
     LIMIT 1`,
    [countryCode]
  );

  return rows[0] || null;
}

/**
 * Get countries in zone
 */
export async function getZoneCountries(zoneId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT country_code FROM zone_countries WHERE zone_id = $1 ORDER BY country_code ASC`,
    [zoneId]
  );

  return rows.map((r) => r.country_code);
}

/**
 * Create zone
 */
export async function createZone(input: {
  code: string;
  name: string;
  description?: string;
  metadata?: any;
}): Promise<Zone> {
  const { rows } = await pool.query(
    `INSERT INTO zones(code, name, description, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     RETURNING *`,
    [input.code, input.name, input.description || null, input.metadata || {}]
  );

  return rows[0];
}

/**
 * Add country to zone
 */
export async function addCountryToZone(zoneId: string, countryCode: string): Promise<void> {
  await pool.query(
    `INSERT INTO zone_countries(zone_id, country_code)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [zoneId, countryCode]
  );
}

/**
 * Check if merchant supports country
 */
export async function merchantSupportsCountry(merchantId: string, countryCode: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM merchant_sub_accounts msa
     JOIN zone_countries zc ON zc.zone_id = ANY(msa.zones_supported)
     WHERE msa.merchant_id = $1 AND zc.country_code = $2
     LIMIT 1`,
    [merchantId, countryCode]
  );

  return rows.length > 0;
}
