import { pool } from '../utils/db';
import * as cache from '../utils/cache';
import { Counter } from 'prom-client';

const listAddCounter = new Counter({
  name: 'molam_merchant_list_add_total',
  help: 'Total merchant list entries added',
  labelNames: ['merchant_id', 'list_type', 'entity_type'],
});

const listRemoveCounter = new Counter({
  name: 'molam_merchant_list_remove_total',
  help: 'Total merchant list entries removed',
  labelNames: ['merchant_id', 'list_type', 'entity_type'],
});

interface AddListEntryInput {
  merchantId: string;
  listType: 'whitelist' | 'blacklist';
  entityType: 'customer' | 'card' | 'ip' | 'device';
  value: string;
  scope?: any;
  reason?: string;
  actorId?: string;
}

interface ListEntry {
  id: string;
  merchant_id: string;
  list_type: string;
  entity_type: string;
  value: string;
  scope: any;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Add entry to whitelist or blacklist
 */
export async function addListEntry(input: AddListEntryInput): Promise<ListEntry> {
  const { merchantId, listType, entityType, value, scope = {}, reason, actorId } = input;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert or update entry
    const { rows } = await client.query<ListEntry>(
      `INSERT INTO merchant_lists (merchant_id, list_type, entity_type, value, scope, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (merchant_id, list_type, entity_type, value)
       DO UPDATE SET scope = EXCLUDED.scope, reason = EXCLUDED.reason, updated_at = NOW()
       RETURNING *`,
      [merchantId, listType, entityType, value, JSON.stringify(scope), reason]
    );

    const entry = rows[0];

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['merchant_list', entry.id, 'add_list_entry', actorId, JSON.stringify({ listType, entityType, value }), merchantId]
    );

    await client.query('COMMIT');

    // Cache the entry
    if (listType === 'whitelist') {
      await cache.cacheWhitelist(merchantId, entityType, value);
    } else {
      await cache.cacheBlacklist(merchantId, entityType, value);
    }

    listAddCounter.inc({ merchant_id: merchantId, list_type: listType, entity_type: entityType });

    return entry;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Remove entry from list
 */
export async function removeListEntry(
  merchantId: string,
  listType: 'whitelist' | 'blacklist',
  entityType: string,
  value: string,
  actorId?: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `DELETE FROM merchant_lists
       WHERE merchant_id = $1 AND list_type = $2 AND entity_type = $3 AND value = $4
       RETURNING id`,
      [merchantId, listType, entityType, value]
    );

    if (rows.length === 0) {
      throw new Error('List entry not found');
    }

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['merchant_list', rows[0].id, 'remove_list_entry', actorId, JSON.stringify({ listType, entityType, value }), merchantId]
    );

    await client.query('COMMIT');

    // Invalidate cache
    await cache.invalidateEntry(merchantId, listType, entityType, value);

    listRemoveCounter.inc({ merchant_id: merchantId, list_type: listType, entity_type: entityType });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all list entries for merchant
 */
export async function getListEntries(
  merchantId: string,
  listType?: 'whitelist' | 'blacklist',
  entityType?: string
): Promise<ListEntry[]> {
  let query = 'SELECT * FROM merchant_lists WHERE merchant_id = $1';
  const params: any[] = [merchantId];

  if (listType) {
    params.push(listType);
    query += ` AND list_type = $${params.length}`;
  }

  if (entityType) {
    params.push(entityType);
    query += ` AND entity_type = $${params.length}`;
  }

  query += ' ORDER BY created_at DESC';

  const { rows } = await pool.query<ListEntry>(query, params);
  return rows;
}

/**
 * Check if entity is whitelisted (cache + DB fallback)
 */
export async function isWhitelisted(
  merchantId: string,
  entityType: 'customer' | 'card' | 'ip' | 'device',
  value: string
): Promise<boolean> {
  // Check cache first
  const cached = await cache.isWhitelisted(merchantId, entityType, value);
  if (cached) return true;

  // Fallback to DB
  const { rows } = await pool.query(
    `SELECT id FROM merchant_lists
     WHERE merchant_id = $1 AND list_type = 'whitelist' AND entity_type = $2 AND value = $3`,
    [merchantId, entityType, value]
  );

  if (rows.length > 0) {
    // Cache for future lookups
    await cache.cacheWhitelist(merchantId, entityType, value);
    return true;
  }

  return false;
}

/**
 * Check if entity is blacklisted (cache + DB fallback)
 */
export async function isBlacklisted(
  merchantId: string,
  entityType: 'customer' | 'card' | 'ip' | 'device',
  value: string
): Promise<boolean> {
  // Check cache first
  const cached = await cache.isBlacklisted(merchantId, entityType, value);
  if (cached) return true;

  // Fallback to DB
  const { rows } = await pool.query(
    `SELECT id FROM merchant_lists
     WHERE merchant_id = $1 AND list_type = 'blacklist' AND entity_type = $2 AND value = $3`,
    [merchantId, entityType, value]
  );

  if (rows.length > 0) {
    // Cache for future lookups
    await cache.cacheBlacklist(merchantId, entityType, value);
    return true;
  }

  return false;
}

/**
 * Bulk import list entries from CSV
 */
export async function bulkImportEntries(
  merchantId: string,
  listType: 'whitelist' | 'blacklist',
  entityType: 'customer' | 'card' | 'ip' | 'device',
  entries: { value: string; reason?: string }[],
  actorId?: string
): Promise<{ imported: number; failed: number }> {
  let imported = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      await addListEntry({
        merchantId,
        listType,
        entityType,
        value: entry.value,
        reason: entry.reason,
        actorId,
      });
      imported++;
    } catch (error) {
      console.error(`[ListsService] Failed to import ${entry.value}:`, error);
      failed++;
    }
  }

  return { imported, failed };
}

/**
 * Preload merchant lists into cache
 */
export async function preloadCache(merchantId: string): Promise<void> {
  const { rows } = await pool.query<ListEntry>(
    'SELECT * FROM merchant_lists WHERE merchant_id = $1',
    [merchantId]
  );

  await cache.preloadMerchantLists(merchantId, rows);
}
