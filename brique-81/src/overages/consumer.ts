// =====================================================================
// Kafka Consumer for Quota Exceeded Events
// =====================================================================
// Processes quota_exceeded events from Brique 80 (Rate Limits)
// Idempotent processing using event_id unique constraint
// Date: 2025-11-12
// =====================================================================

import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { Pool } from 'pg';
import { ComputeAmountService } from './computeAmount';
import { OveragePricingService } from './pricing';

// =====================================================================
// Types
// =====================================================================

export interface QuotaExceededEvent {
  event_id: string; // Unique idempotency key
  tenant_id: string;
  api_key_id: string;
  plan_id: string;
  country: string;
  metric: 'requests_per_second' | 'requests_per_day' | 'requests_per_month' | 'data_transfer_gb' | 'api_calls' | 'compute_seconds';
  quota_limit: number;
  units_exceeded: number;
  timestamp: string; // ISO 8601
  metadata?: {
    endpoint?: string;
    ip_address?: string;
    user_agent?: string;
    [key: string]: any;
  };
}

export interface ConsumerConfig {
  kafkaBrokers: string[];
  groupId: string;
  topic: string;
  autoCommit?: boolean;
  autoCommitInterval?: number;
}

// =====================================================================
// Overage Event Consumer
// =====================================================================

export class OverageEventConsumer {
  private kafka: Kafka;
  private consumer: Consumer;
  private computeService: ComputeAmountService;
  private pricingService: OveragePricingService;
  private isRunning = false;

  constructor(
    private pool: Pool,
    private config: ConsumerConfig
  ) {
    this.kafka = new Kafka({
      clientId: 'molam-overage-billing',
      brokers: config.kafkaBrokers,
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: config.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    this.computeService = new ComputeAmountService(pool);
    this.pricingService = new OveragePricingService(pool);
  }

  /**
   * Start consuming events
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Consumer already running');
      return;
    }

    await this.consumer.connect();
    console.log(`Connected to Kafka brokers: ${this.config.kafkaBrokers.join(', ')}`);

    await this.consumer.subscribe({
      topic: this.config.topic,
      fromBeginning: false, // Only process new events
    });

    console.log(`Subscribed to topic: ${this.config.topic}`);

    await this.consumer.run({
      autoCommit: this.config.autoCommit ?? true,
      autoCommitInterval: this.config.autoCommitInterval ?? 5000,
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.isRunning = true;
    console.log('Consumer started successfully');
  }

  /**
   * Stop consuming events
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Consumer not running');
      return;
    }

    await this.consumer.disconnect();
    this.isRunning = false;
    console.log('Consumer stopped');
  }

  /**
   * Handle incoming Kafka message
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    try {
      // Parse event
      const event = this.parseEvent(message.value);

      console.log(
        `Processing event: ${event.event_id} (tenant=${event.tenant_id}, metric=${event.metric}, units=${event.units_exceeded})`
      );

      // Process event (idempotent)
      await this.processEvent(event);

      console.log(`Successfully processed event: ${event.event_id}`);
    } catch (error) {
      console.error(
        `Error processing message from ${topic}:${partition} offset ${message.offset}:`,
        error
      );

      // Log error to database for alerting/monitoring
      await this.logProcessingError(message, error);

      // Don't throw - we want to continue processing other messages
      // Ops can investigate failed events via the error log
    }
  }

  /**
   * Parse Kafka message to typed event
   */
  private parseEvent(messageValue: Buffer | null): QuotaExceededEvent {
    if (!messageValue) {
      throw new Error('Empty message value');
    }

    const event = JSON.parse(messageValue.toString()) as QuotaExceededEvent;

    // Validate required fields
    if (!event.event_id) throw new Error('Missing event_id');
    if (!event.tenant_id) throw new Error('Missing tenant_id');
    if (!event.api_key_id) throw new Error('Missing api_key_id');
    if (!event.plan_id) throw new Error('Missing plan_id');
    if (!event.country) throw new Error('Missing country');
    if (!event.metric) throw new Error('Missing metric');
    if (event.units_exceeded === undefined || event.units_exceeded === null) {
      throw new Error('Missing units_exceeded');
    }
    if (!event.timestamp) throw new Error('Missing timestamp');

    return event;
  }

  /**
   * Process quota exceeded event (idempotent)
   */
  private async processEvent(event: QuotaExceededEvent): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Insert raw event (idempotent via event_id unique constraint)
      const eventInsertResult = await client.query(
        `
        INSERT INTO billing_overage_events (
          event_id,
          tenant_id,
          api_key_id,
          plan_id,
          country,
          metric,
          quota_limit,
          units_exceeded,
          event_timestamp,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING id
        `,
        [
          event.event_id,
          event.tenant_id,
          event.api_key_id,
          event.plan_id,
          event.country,
          event.metric,
          event.quota_limit,
          event.units_exceeded,
          event.timestamp,
          JSON.stringify(event.metadata || {}),
        ]
      );

      // If no rows returned, event already processed
      if (eventInsertResult.rows.length === 0) {
        console.log(`Event ${event.event_id} already processed (idempotency)`);
        await client.query('ROLLBACK');
        return;
      }

      // 2. Compute billable amount
      const computed = await this.computeService.computeAmount({
        tenantId: event.tenant_id,
        apiKeyId: event.api_key_id,
        planId: event.plan_id,
        country: event.country,
        metric: event.metric,
        unitsExceeded: event.units_exceeded,
        timestamp: new Date(event.timestamp),
      });

      // 3. Insert normalized overage charge
      await client.query(
        `
        INSERT INTO billing_overages (
          event_id,
          tenant_id,
          api_key_id,
          plan_id,
          country,
          metric,
          units,
          unit_price,
          amount,
          currency,
          billing_model,
          pricing_rule_id,
          tier_breakdown,
          overage_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          event.event_id,
          event.tenant_id,
          event.api_key_id,
          event.plan_id,
          event.country,
          event.metric,
          computed.units,
          computed.unitPrice,
          computed.amount,
          computed.currency,
          computed.billingModel,
          computed.pricingRuleId,
          computed.tierBreakdown ? JSON.stringify(computed.tierBreakdown) : null,
          event.timestamp,
        ]
      );

      // 4. Update aggregation metrics (realtime window)
      await this.updateAggregationMetrics(client, event, computed);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update aggregation metrics for dashboards
   */
  private async updateAggregationMetrics(
    client: any,
    event: QuotaExceededEvent,
    computed: any
  ): Promise<void> {
    // This could be replaced with a materialized view refresh or time-series table
    // For now, we'll leave it as a placeholder

    // Example: Update hourly aggregates
    const hourBucket = new Date(event.timestamp);
    hourBucket.setMinutes(0, 0, 0);

    // Upsert hourly metrics
    // (In production, consider using a time-series database like TimescaleDB)
  }

  /**
   * Log processing error for Ops investigation
   */
  private async logProcessingError(message: any, error: any): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO overage_processing_errors (
          topic,
          partition,
          offset,
          message_value,
          error_message,
          error_stack
        ) VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          this.config.topic,
          message.partition,
          message.offset,
          message.value?.toString() || null,
          error.message,
          error.stack,
        ]
      );
    } catch (logError) {
      console.error('Failed to log processing error:', logError);
    }
  }

  /**
   * Get consumer status
   */
  getStatus(): { isRunning: boolean; topic: string; groupId: string } {
    return {
      isRunning: this.isRunning,
      topic: this.config.topic,
      groupId: this.config.groupId,
    };
  }
}

// =====================================================================
// Consumer Factory
// =====================================================================

export function createOverageConsumer(
  pool: Pool,
  config?: Partial<ConsumerConfig>
): OverageEventConsumer {
  const defaultConfig: ConsumerConfig = {
    kafkaBrokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    groupId: process.env.KAFKA_GROUP_ID || 'molam-overage-billing',
    topic: process.env.KAFKA_OVERAGE_TOPIC || 'quota_exceeded',
    autoCommit: true,
    autoCommitInterval: 5000,
  };

  return new OverageEventConsumer(pool, { ...defaultConfig, ...config });
}

// =====================================================================
// CLI Entry Point (for standalone consumer process)
// =====================================================================

if (require.main === module) {
  const { Pool } = require('pg');

  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'molam_connect',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
  });

  const consumer = createOverageConsumer(pool);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await consumer.stop();
    await pool.end();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await consumer.stop();
    await pool.end();
    process.exit(0);
  });

  // Start consumer
  consumer.start().catch((error) => {
    console.error('Failed to start consumer:', error);
    process.exit(1);
  });
}
