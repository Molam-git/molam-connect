/**
 * Brique 51bis - Merchant Refund Policies & Zones
 * Zone API Routes
 */

import { Router, Request, Response } from "express";
import { requireRole } from "../utils/authz.js";
import {
  listZones,
  getZoneByCode,
  getZoneForCountry,
  getZoneCountries,
  createZone,
  addCountryToZone,
  merchantSupportsCountry,
} from "../services/policy/zoneService.js";
import { pool } from "../utils/db.js";

export const zoneRouter = Router();

/**
 * List all zones
 * GET /api/zones
 */
zoneRouter.get("/zones", async (req: Request, res: Response) => {
  try {
    const zones = await listZones();
    res.json(zones);
  } catch (e: any) {
    console.error("List zones error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Get zone by code
 * GET /api/zones/:code
 */
zoneRouter.get("/zones/:code", async (req: Request, res: Response) => {
  try {
    const zone = await getZoneByCode(req.params.code);

    if (!zone) {
      res.status(404).json({ error: "zone_not_found" });
      return;
    }

    res.json(zone);
  } catch (e: any) {
    console.error("Get zone error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Get zone for country
 * GET /api/zones/country/:iso2
 */
zoneRouter.get("/zones/country/:iso2", async (req: Request, res: Response) => {
  try {
    const zone = await getZoneForCountry(req.params.iso2.toUpperCase());

    if (!zone) {
      res.status(404).json({ error: "zone_not_found_for_country" });
      return;
    }

    res.json(zone);
  } catch (e: any) {
    console.error("Get zone for country error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Get countries in zone
 * GET /api/zones/:id/countries
 */
zoneRouter.get("/zones/:id/countries", async (req: Request, res: Response) => {
  try {
    const countries = await getZoneCountries(req.params.id);
    res.json(countries);
  } catch (e: any) {
    console.error("Get zone countries error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Create zone (Ops only)
 * POST /api/zones
 */
zoneRouter.post("/zones", requireRole("finance_ops", "pay_admin"), async (req: any, res: Response) => {
  try {
    const { code, name, description, metadata } = req.body;

    if (!code || !name) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const zone = await createZone({ code, name, description, metadata });
    res.json(zone);
  } catch (e: any) {
    console.error("Create zone error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Add country to zone (Ops only)
 * POST /api/zones/:id/countries
 */
zoneRouter.post("/zones/:id/countries", requireRole("finance_ops", "pay_admin"), async (req: any, res: Response) => {
  try {
    const { country_code } = req.body;

    if (!country_code) {
      res.status(400).json({ error: "country_code_required" });
      return;
    }

    await addCountryToZone(req.params.id, country_code.toUpperCase());
    res.json({ success: true });
  } catch (e: any) {
    console.error("Add country to zone error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Get merchant supported zones
 * GET /api/merchant/:id/zones
 */
zoneRouter.get("/merchant/:id/zones", requireRole("merchant_admin", "pay_admin"), async (req: any, res: Response) => {
  try {
    // Check authorization
    if (req.user.roles.includes("merchant_admin") && req.params.id !== req.user.merchantId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT z.* FROM zones z
       JOIN merchant_sub_accounts msa ON z.id = ANY(msa.zones_supported)
       WHERE msa.merchant_id = $1`,
      [req.params.id]
    );

    res.json(rows);
  } catch (e: any) {
    console.error("Get merchant zones error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Check if merchant supports country (validation endpoint)
 * GET /api/merchant/:id/supports/:country
 */
zoneRouter.get("/merchant/:id/supports/:country", async (req: Request, res: Response) => {
  try {
    const supported = await merchantSupportsCountry(req.params.id, req.params.country.toUpperCase());
    res.json({ supported });
  } catch (e: any) {
    console.error("Check merchant country support error:", e);
    res.status(500).json({ error: e.message });
  }
});
