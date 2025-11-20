#!/usr/bin/env ts-node
/**
 * BRIQUE 145 — Historical Data Backfill Script
 * Reprocess historical events from source database into ClickHouse
 */
import { createClient } from '@clickhouse/client';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || ''
});

const postgres = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'molam',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || ''
});

interface BackfillConfig {
  startDate: Date;
  endDate: Date;
  batchSize: number;
  dryRun: boolean;
}

const COUNTRY_TO_ZONE: Record<string, string> = {
  SN: 'CEDEAO', ML: 'CEDEAO', CI: 'CEDEAO', BF: 'CEDEAO', NE: 'CEDEAO',
  CM: 'CEMAC', GA: 'CEMAC', CG: 'CEMAC', TD: 'CEMAC', CF: 'CEMAC',
  FR: 'EU', DE: 'EU', ES: 'EU', IT: 'EU', BE: 'EU',
  US: 'US', CA: 'US',
  SG: 'ASEAN', MY: 'ASEAN', TH: 'ASEAN', ID: 'ASEAN'
};

function mapCountryToZone(country?: string): string {
  if (!country) return 'GLOBAL';
  return COUNTRY_TO_ZONE[country.toUpperCase()] || 'GLOBAL';
}

async function backfillTransactions(config: BackfillConfig) {
  console.log('🔄 Starting transaction backfill...');
  console.log(`📅 Date range: ${config.startDate.toISOString()} → ${config.endDate.toISOString()}`);
  console.log(`📦 Batch size: ${config.batchSize}`);
  console.log(`🔍 Dry run: ${config.dryRun}`);

  let offset = 0;
  let totalProcessed = 0;
  let totalInserted = 0;

  while (true) {
    // Fetch batch from PostgreSQL
    const { rows } = await postgres.query(`
      SELECT
        id,
        amount,
        currency,
        fee,
        status,
        country,
        city,
        merchant_id,
        created_at
      FROM transactions
      WHERE created_at >= $1 AND created_at < $2
        AND status = 'succeeded'
      ORDER BY created_at ASC
      LIMIT $3 OFFSET $4
    `, [config.startDate, config.endDate, config.batchSize, offset]);

    if (rows.length === 0) {
      console.log('✅ No more rows to process');
      break;
    }

    totalProcessed += rows.length;

    // Transform to ClickHouse format
    const events = rows.map(row => ({
      event_id: row.id,
      event_time: new Date(row.created_at).getTime() / 1000,
      event_type: 'transaction',
      zone: mapCountryToZone(row.country),
      region: null,
      country: row.country || null,
      city: row.city || null,
      amount: parseFloat(row.amount),
      currency: row.currency,
      fee: parseFloat(row.fee || 0),
      status: row.status,
      tx_type: 'payment',
      merchant_id: row.merchant_id,
      refund_amount: 0,
      is_dispute: false
    }));

    if (!config.dryRun) {
      // Insert into ClickHouse
      await clickhouse.insert({
        table: 'analytics_events_raw',
        values: events,
        format: 'JSONEachRow'
      });

      totalInserted += events.length;
    }

    console.log(`📊 Processed ${totalProcessed} transactions (inserted: ${totalInserted})`);

    offset += config.batchSize;

    // Rate limiting: wait 100ms between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('✅ Backfill complete!');
  console.log(`   Total processed: ${totalProcessed}`);
  console.log(`   Total inserted: ${totalInserted}`);
}

async function backfillPayouts(config: BackfillConfig) {
  console.log('🔄 Starting payout backfill...');

  let offset = 0;
  let totalProcessed = 0;

  while (true) {
    const { rows } = await postgres.query(`
      SELECT
        id,
        amount,
        currency,
        fee,
        status,
        country,
        merchant_id,
        settled_at
      FROM payouts
      WHERE settled_at >= $1 AND settled_at < $2
        AND status = 'settled'
      ORDER BY settled_at ASC
      LIMIT $3 OFFSET $4
    `, [config.startDate, config.endDate, config.batchSize, offset]);

    if (rows.length === 0) break;

    totalProcessed += rows.length;

    const events = rows.map(row => ({
      event_id: row.id,
      event_time: new Date(row.settled_at).getTime() / 1000,
      event_type: 'payout',
      zone: mapCountryToZone(row.country),
      region: null,
      country: row.country || null,
      city: null,
      amount: parseFloat(row.amount),
      currency: row.currency,
      fee: parseFloat(row.fee || 0),
      status: row.status,
      tx_type: 'payout',
      merchant_id: row.merchant_id,
      refund_amount: 0,
      is_dispute: false
    }));

    if (!config.dryRun) {
      await clickhouse.insert({
        table: 'analytics_events_raw',
        values: events,
        format: 'JSONEachRow'
      });
    }

    console.log(`📊 Processed ${totalProcessed} payouts`);

    offset += config.batchSize;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`✅ Payout backfill complete! Total: ${totalProcessed}`);
}

async function main() {
  const args = process.argv.slice(2);

  const config: BackfillConfig = {
    startDate: args[0] ? new Date(args[0]) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: args[1] ? new Date(args[1]) : new Date(),
    batchSize: args[2] ? parseInt(args[2]) : 1000,
    dryRun: args.includes('--dry-run')
  };

  try {
    await backfillTransactions(config);
    await backfillPayouts(config);

    console.log('\n🎉 All backfills completed successfully!');
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await postgres.end();
    await clickhouse.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { backfillTransactions, backfillPayouts };
