/**
 * Brique 111 - Merchant Config UI
 * Plugin Lifecycle Service: Update, rollback, version management
 */

import { pool, tx } from "../db";

export interface UpdateResult {
  update_id: string;
  status: string;
  old_version: string;
  new_version: string;
}

export class PluginLifecycleService {
  /**
   * Start a plugin update
   */
  async startUpdate(
    pluginId: string,
    merchantId: string,
    newVersion: string
  ): Promise<UpdateResult> {
    return await tx(async (client) => {
      // Get current plugin state
      const { rows: pluginRows } = await client.query(
        `SELECT * FROM merchant_plugins WHERE id = $1 AND merchant_id = $2`,
        [pluginId, merchantId]
      );

      if (pluginRows.length === 0) {
        throw new Error("Plugin not found");
      }

      const plugin = pluginRows[0];

      // Create update record
      const { rows: updateRows } = await client.query(
        `INSERT INTO plugin_updates 
         (merchant_plugin_id, old_version, new_version, status, started_at)
         VALUES ($1, $2, $3, 'in_progress', now())
         RETURNING *`,
        [pluginId, plugin.plugin_version, newVersion]
      );

      const update = updateRows[0];

      // Add log entry
      const logs = [
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Starting update from ${plugin.plugin_version} to ${newVersion}`
        }
      ];

      await client.query(
        `UPDATE plugin_updates SET logs = $1 WHERE id = $2`,
        [JSON.stringify(logs), update.id]
      );

      // Update plugin status
      await client.query(
        `UPDATE merchant_plugins 
         SET status = 'pending_update', updated_at = now() 
         WHERE id = $1`,
        [pluginId]
      );

      // In a real implementation, this would trigger the actual update process
      // For now, we'll simulate it
      setTimeout(async () => {
        await this.completeUpdate(update.id, pluginId, newVersion, true);
      }, 1000);

      return {
        update_id: update.id,
        status: "in_progress",
        old_version: plugin.plugin_version,
        new_version: newVersion
      };
    });
  }

  /**
   * Complete an update (called by worker or after async process)
   */
  async completeUpdate(
    updateId: string,
    pluginId: string,
    newVersion: string,
    success: boolean
  ): Promise<void> {
    await tx(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM plugin_updates WHERE id = $1`,
        [updateId]
      );

      if (rows.length === 0) {
        throw new Error("Update not found");
      }

      const update = rows[0];
      const logs = update.logs || [];

      if (success) {
        // Update plugin version
        await client.query(
          `UPDATE merchant_plugins 
           SET plugin_version = $1, 
               status = 'active',
               updated_at = now()
           WHERE id = $2`,
          [newVersion, pluginId]
        );

        // Mark update as success
        await client.query(
          `UPDATE plugin_updates 
           SET status = 'success',
               completed_at = now(),
               logs = $1
           WHERE id = $2`,
          [
            JSON.stringify([
              ...logs,
              {
                timestamp: new Date().toISOString(),
                level: "info",
                message: "Update completed successfully"
              }
            ]),
            updateId
          ]
        );
      } else {
        // Mark update as failed
        await client.query(
          `UPDATE plugin_updates 
           SET status = 'failed',
               completed_at = now(),
               logs = $1
           WHERE id = $2`,
          [
            JSON.stringify([
              ...logs,
              {
                timestamp: new Date().toISOString(),
                level: "error",
                message: "Update failed"
              }
            ]),
            updateId
          ]
        );

        // Restore plugin status
        await client.query(
          `UPDATE merchant_plugins 
           SET status = 'error', updated_at = now() 
           WHERE id = $1`,
          [pluginId]
        );
      }
    });
  }

  /**
   * Rollback a plugin update
   */
  async rollback(
    pluginId: string,
    merchantId: string,
    updateId: string,
    reason?: string
  ): Promise<UpdateResult> {
    return await tx(async (client) => {
      // Get update record
      const { rows: updateRows } = await client.query(
        `SELECT * FROM plugin_updates WHERE id = $1 AND merchant_plugin_id = $2`,
        [updateId, pluginId]
      );

      if (updateRows.length === 0) {
        throw new Error("Update not found");
      }

      const update = updateRows[0];

      if (update.status === "rolled_back") {
        throw new Error("Update already rolled back");
      }

      // Get plugin
      const { rows: pluginRows } = await client.query(
        `SELECT * FROM merchant_plugins WHERE id = $1 AND merchant_id = $2`,
        [pluginId, merchantId]
      );

      if (pluginRows.length === 0) {
        throw new Error("Plugin not found");
      }

      const plugin = pluginRows[0];

      // Rollback to old version
      await client.query(
        `UPDATE merchant_plugins 
         SET plugin_version = $1,
             status = 'active',
             updated_at = now()
         WHERE id = $2`,
        [update.old_version, pluginId]
      );

      // Mark update as rolled back
      const logs = update.logs || [];
      await client.query(
        `UPDATE plugin_updates 
         SET status = 'rolled_back',
             rollback_reason = $1,
             completed_at = now(),
             logs = $2
         WHERE id = $3`,
        [
          reason || "Manual rollback",
          JSON.stringify([
            ...logs,
            {
              timestamp: new Date().toISOString(),
              level: "info",
              message: `Rolled back to ${update.old_version}. Reason: ${reason || "Manual rollback"}`
            }
          ]),
          updateId
        ]
      );

      return {
        update_id: updateId,
        status: "rolled_back",
        old_version: update.new_version,
        new_version: update.old_version
      };
    });
  }

  /**
   * Get update history for a plugin
   */
  async getUpdateHistory(pluginId: string): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT * FROM plugin_updates 
       WHERE merchant_plugin_id = $1 
       ORDER BY created_at DESC`,
      [pluginId]
    );

    return rows;
  }
}

export const pluginLifecycleService = new PluginLifecycleService();


