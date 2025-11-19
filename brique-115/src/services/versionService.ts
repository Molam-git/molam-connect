/**
 * Brique 115 - Plugin Versioning & Migration Strategy
 * Version Service: Version checking, compatibility, latest version
 */

import { pool } from "../db";
import semver from "semver";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

export interface PluginVersion {
  id: string;
  name: string;
  version: string;
  api_min_version: string;
  api_max_version: string;
  checksum: string;
  build_date: string;
  release_notes?: string;
  status: string;
  backwards_compatible: boolean;
  migration_required: boolean;
  download_url?: string;
  security_advisory?: string;
}

/**
 * Get latest version for a plugin
 */
export async function getLatestVersion(
  pluginName: string,
  includeBeta: boolean = false
): Promise<PluginVersion | null> {
  const { rows } = await pool.query(
    `SELECT * FROM plugin_versions
     WHERE name = $1
       AND status IN ($2, $3)
     ORDER BY 
       -- Sort by semantic version
       string_to_array(version, '.')::int[] DESC
     LIMIT 1`,
    [pluginName, "active", includeBeta ? "beta" : "active"]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get all versions for a plugin
 */
export async function getAllVersions(pluginName: string): Promise<PluginVersion[]> {
  const { rows } = await pool.query(
    `SELECT * FROM plugin_versions
     WHERE name = $1
     ORDER BY created_at DESC`,
    [pluginName]
  );

  return rows;
}

/**
 * Check version compatibility
 */
export async function checkCompatibility(
  pluginName: string,
  pluginVersion: string,
  apiVersion: string
): Promise<{ compatible: boolean; reason?: string }> {
  const { rows } = await pool.query(
    `SELECT check_version_compatibility($1, $2, $3) as compatible`,
    [pluginName, pluginVersion, apiVersion]
  );

  if (rows.length === 0 || !rows[0].compatible) {
    // Get detailed reason
    const { rows: pluginRows } = await pool.query(
      `SELECT * FROM plugin_versions WHERE name = $1 AND version = $2`,
      [pluginName, pluginVersion]
    );

    if (pluginRows.length === 0) {
      return { compatible: false, reason: "Plugin version not found" };
    }

    const plugin = pluginRows[0];

    if (plugin.status === "blocked") {
      return { compatible: false, reason: "Version is blocked (security issue)" };
    }

    if (plugin.status === "deprecated") {
      return { compatible: false, reason: "Version is deprecated" };
    }

    if (apiVersion < plugin.api_min_version || apiVersion > plugin.api_max_version) {
      return {
        compatible: false,
        reason: `API version ${apiVersion} not in range [${plugin.api_min_version}, ${plugin.api_max_version}]`
      };
    }

    return { compatible: false, reason: "Compatibility check failed" };
  }

  return { compatible: true };
}

/**
 * Compare versions (semantic versioning)
 */
export function compareVersions(v1: string, v2: string): number {
  try {
    return semver.compare(v1, v2);
  } catch (error) {
    // Fallback to string comparison if not semver
    return v1.localeCompare(v2);
  }
}

/**
 * Check if update is available
 */
export async function isUpdateAvailable(
  pluginName: string,
  currentVersion: string
): Promise<{ available: boolean; latestVersion?: string }> {
  const latest = await getLatestVersion(pluginName);

  if (!latest) {
    return { available: false };
  }

  const comparison = compareVersions(latest.version, currentVersion);
  return {
    available: comparison > 0,
    latestVersion: comparison > 0 ? latest.version : undefined
  };
}

/**
 * Get required migrations for version upgrade
 */
export async function getRequiredMigrations(
  pluginName: string,
  fromVersion: string,
  toVersion: string
): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM get_required_migrations($1, $2, $3)`,
    [pluginName, fromVersion, toVersion]
  );

  return rows;
}

