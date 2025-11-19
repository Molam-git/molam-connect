// ============================================================================
// Pay Entry API Routes
// ============================================================================

import { Router, Request, Response } from "express";
import {
  getPreferences,
  upsertPreferences,
  getDefaultPreferences,
} from "../services/preferenceService";
import { publishSiraEvent, computeLocalRecommendation } from "../sira/hook";
import { logger } from "../logger";
import * as promClient from "prom-client";

export const entryRouter = Router();

// Prometheus metrics
const requestCounter = new promClient.Counter({
  name: "molam_pay_entry_requests_total",
  help: "Total number of pay entry requests",
  labelNames: ["method", "endpoint", "status"],
});

const requestDuration = new promClient.Histogram({
  name: "molam_pay_entry_request_duration_seconds",
  help: "Pay entry request duration in seconds",
  labelNames: ["method", "endpoint"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

/**
 * GET /api/pay/entry
 * Get user pay entry configuration
 */
entryRouter.get("/", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const user = req.user!;

  try {
    logger.info("Fetching pay entry preferences", { user_id: user.sub });

    // Get user preferences from database
    let prefs = await getPreferences(user.sub);

    // If no preferences exist, return defaults (don't persist automatically)
    if (!prefs) {
      logger.debug("No preferences found, returning defaults", {
        user_id: user.sub,
      });

      const defaultPrefs = getDefaultPreferences(user.sub, {
        country: user.country,
        currency: user.currency,
        lang: user.lang,
      });

      requestCounter.inc({ method: "GET", endpoint: "/entry", status: "200" });
      requestDuration.observe(
        { method: "GET", endpoint: "/entry" },
        (Date.now() - startTime) / 1000
      );

      return res.json(defaultPrefs);
    }

    // Call SIRA for AI hints (non-blocking)
    try {
      const siraHint = await publishSiraEvent("entry.get", {
        user: user.sub,
        prefs,
        context: {
          country: user.country,
          currency: user.currency,
          lang: user.lang,
        },
      });

      // Apply SIRA recommendation if auto_redirect is enabled
      if (siraHint && prefs.auto_redirect && siraHint.preferred_module) {
        logger.debug("Applying SIRA recommendation", {
          user_id: user.sub,
          recommended_module: siraHint.preferred_module,
        });
        prefs.preferred_module = siraHint.preferred_module;
      } else {
        // Fallback to local recommendation
        const localHint = computeLocalRecommendation(prefs);
        if (localHint && prefs.auto_redirect && localHint.preferred_module) {
          prefs.preferred_module = localHint.preferred_module;
        }
      }
    } catch (error: any) {
      // SIRA call failed - continue with existing preferences
      logger.warn("SIRA hint failed, using existing preferences", {
        user_id: user.sub,
        error: error.message,
      });
    }

    requestCounter.inc({ method: "GET", endpoint: "/entry", status: "200" });
    requestDuration.observe(
      { method: "GET", endpoint: "/entry" },
      (Date.now() - startTime) / 1000
    );

    res.json(prefs);
  } catch (error: any) {
    logger.error("Failed to fetch pay entry preferences", {
      user_id: user.sub,
      error: error.message,
    });

    requestCounter.inc({ method: "GET", endpoint: "/entry", status: "500" });

    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/pay/entry
 * Update user preferences
 */
entryRouter.post("/", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const user = req.user!;
  const body = req.body;

  try {
    logger.info("Updating pay entry preferences", {
      user_id: user.sub,
      changes: Object.keys(body),
    });

    // Validate input
    if (body.modules_enabled && !Array.isArray(body.modules_enabled)) {
      requestCounter.inc({ method: "POST", endpoint: "/entry", status: "400" });
      return res.status(400).json({ error: "modules_enabled_must_be_array" });
    }

    if (
      body.preferred_module &&
      typeof body.preferred_module !== "string" &&
      body.preferred_module !== null
    ) {
      requestCounter.inc({ method: "POST", endpoint: "/entry", status: "400" });
      return res
        .status(400)
        .json({ error: "preferred_module_must_be_string_or_null" });
    }

    // Upsert preferences
    const updated = await upsertPreferences(user.sub, {
      preferred_module: body.preferred_module,
      last_module_used: body.last_module_used,
      modules_enabled: body.modules_enabled,
      auto_redirect: body.auto_redirect,
      country: body.country || user.country,
      currency: body.currency || user.currency,
      lang: body.lang || user.lang,
      updated_by: user.sub,
    });

    // Notify SIRA of preference change (non-blocking)
    publishSiraEvent("entry.update", {
      user: user.sub,
      changes: body,
      new_prefs: updated,
    }).catch((err) => {
      logger.warn("Failed to notify SIRA of preference change", {
        user_id: user.sub,
        error: err.message,
      });
    });

    requestCounter.inc({ method: "POST", endpoint: "/entry", status: "200" });
    requestDuration.observe(
      { method: "POST", endpoint: "/entry" },
      (Date.now() - startTime) / 1000
    );

    res.json(updated);
  } catch (error: any) {
    logger.error("Failed to update pay entry preferences", {
      user_id: user.sub,
      error: error.message,
    });

    requestCounter.inc({ method: "POST", endpoint: "/entry", status: "500" });

    res.status(500).json({ error: "internal_server_error" });
  }
});
