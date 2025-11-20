/**
 * Transaction Aggregation Worker
 * Processes transaction events and updates daily/hourly aggregates
 * Runs continuously, polling for unprocessed events
 */
import { pool, withTransaction } from '../utils/db';
import { PoolClient } from 'pg';

interface TransactionEvent {
  id: string;
  merchant_id: string;
  transaction_id: string;
  customer_id: string | null;
  event_type: string;
  amount: number;
  currency: string;
  fee: number;
  payment_method: string | null;
  product_id: string | null;
  product_name: string | null;
  metadata: any;
  created_at: Date;
}

export class AggregationWorker {
  private running: boolean = false;
  private pollInterval: number = 5000; // 5 seconds

  async start() {
    console.log('🚀 Aggregation worker starting...');
    this.running = true;

    while (this.running) {
      try {
        await this.processEvents();
        await this.sleep(this.pollInterval);
      } catch (error) {
        console.error('❌ Error in aggregation worker:', error);
        await this.sleep(this.pollInterval * 2); // Back off on error
      }
    }

    console.log('Aggregation worker stopped');
  }

  stop() {
    console.log('Stopping aggregation worker...');
    this.running = false;
  }

  private async processEvents() {
    // Fetch unprocessed events (batch of 100)
    const { rows: events } = await pool.query<TransactionEvent>(
      `SELECT *
       FROM transaction_events
       WHERE processed = false
       ORDER BY created_at ASC
       LIMIT 100`
    );

    if (events.length === 0) {
      return; // No events to process
    }

    console.log(`📊 Processing ${events.length} transaction events...`);

    for (const event of events) {
      try {
        await withTransaction(async (client) => {
          await this.processEvent(client, event);

          // Mark event as processed
          await client.query(
            `UPDATE transaction_events
             SET processed = true, processed_at = now()
             WHERE id = $1`,
            [event.id]
          );
        });
      } catch (error) {
        console.error(`Failed to process event ${event.id}:`, error);
        // Continue with next event
      }
    }

    console.log(`✅ Processed ${events.length} events`);
  }

  private async processEvent(client: PoolClient, event: TransactionEvent) {
    const eventDate = new Date(event.created_at);
    const date = eventDate.toISOString().split('T')[0];
    const hourTimestamp = new Date(eventDate);
    hourTimestamp.setMinutes(0, 0, 0);

    // Update daily aggregates
    await this.updateDailyAggregates(client, event, date);

    // Update hourly aggregates
    await this.updateHourlyAggregates(client, event, hourTimestamp);

    // Update product stats (if product info available)
    if (event.product_id && event.product_name) {
      await this.updateProductStats(client, event, date);
    }

    // Update customer stats (if customer ID available)
    if (event.customer_id) {
      await this.updateCustomerStats(client, event);
    }
  }

  private async updateDailyAggregates(
    client: PoolClient,
    event: TransactionEvent,
    date: string
  ) {
    const isSuccess = event.event_type === 'payment_succeeded';
    const isFailed = event.event_type === 'payment_failed';
    const isPending = event.event_type === 'payment_created';

    // Upsert daily aggregate
    await client.query(
      `INSERT INTO merchant_daily_aggregates (
        merchant_id, date, currency,
        total_transactions,
        successful_transactions,
        failed_transactions,
        pending_transactions,
        total_revenue,
        total_fees,
        net_revenue,
        mobile_money_count, mobile_money_amount,
        card_count, card_amount,
        bank_transfer_count, bank_transfer_amount,
        qr_payment_count, qr_payment_amount
      ) VALUES (
        $1, $2, $3,
        1,
        $4::int, $5::int, $6::int,
        $7, $8, $9,
        $10::int, $11,
        $12::int, $13,
        $14::int, $15,
        $16::int, $17
      )
      ON CONFLICT (merchant_id, date, currency)
      DO UPDATE SET
        total_transactions = merchant_daily_aggregates.total_transactions + 1,
        successful_transactions = merchant_daily_aggregates.successful_transactions + $4::int,
        failed_transactions = merchant_daily_aggregates.failed_transactions + $5::int,
        pending_transactions = merchant_daily_aggregates.pending_transactions + $6::int,
        total_revenue = merchant_daily_aggregates.total_revenue + $7,
        total_fees = merchant_daily_aggregates.total_fees + $8,
        net_revenue = merchant_daily_aggregates.net_revenue + $9,
        mobile_money_count = merchant_daily_aggregates.mobile_money_count + $10::int,
        mobile_money_amount = merchant_daily_aggregates.mobile_money_amount + $11,
        card_count = merchant_daily_aggregates.card_count + $12::int,
        card_amount = merchant_daily_aggregates.card_amount + $13,
        bank_transfer_count = merchant_daily_aggregates.bank_transfer_count + $14::int,
        bank_transfer_amount = merchant_daily_aggregates.bank_transfer_amount + $15,
        qr_payment_count = merchant_daily_aggregates.qr_payment_count + $16::int,
        qr_payment_amount = merchant_daily_aggregates.qr_payment_amount + $17,
        updated_at = now()`,
      [
        event.merchant_id,
        date,
        event.currency,
        isSuccess ? 1 : 0,
        isFailed ? 1 : 0,
        isPending ? 1 : 0,
        isSuccess ? event.amount : 0,
        isSuccess ? event.fee : 0,
        isSuccess ? event.amount - event.fee : 0,
        event.payment_method === 'mobile_money' ? 1 : 0,
        event.payment_method === 'mobile_money' ? event.amount : 0,
        event.payment_method === 'card' ? 1 : 0,
        event.payment_method === 'card' ? event.amount : 0,
        event.payment_method === 'bank_transfer' ? 1 : 0,
        event.payment_method === 'bank_transfer' ? event.amount : 0,
        event.payment_method === 'qr_payment' ? 1 : 0,
        event.payment_method === 'qr_payment' ? event.amount : 0
      ]
    );

    // Update average transaction amount
    await client.query(
      `UPDATE merchant_daily_aggregates
       SET avg_transaction_amount = CASE
         WHEN total_transactions > 0
         THEN total_revenue / total_transactions
         ELSE 0
       END
       WHERE merchant_id = $1 AND date = $2 AND currency = $3`,
      [event.merchant_id, date, event.currency]
    );
  }

  private async updateHourlyAggregates(
    client: PoolClient,
    event: TransactionEvent,
    hourTimestamp: Date
  ) {
    const isSuccess = event.event_type === 'payment_succeeded';

    await client.query(
      `INSERT INTO merchant_hourly_aggregates (
        merchant_id, hour_timestamp, currency,
        total_transactions,
        successful_transactions,
        total_revenue
      ) VALUES ($1, $2, $3, 1, $4::int, $5)
      ON CONFLICT (merchant_id, hour_timestamp, currency)
      DO UPDATE SET
        total_transactions = merchant_hourly_aggregates.total_transactions + 1,
        successful_transactions = merchant_hourly_aggregates.successful_transactions + $4::int,
        total_revenue = merchant_hourly_aggregates.total_revenue + $5`,
      [
        event.merchant_id,
        hourTimestamp,
        event.currency,
        isSuccess ? 1 : 0,
        isSuccess ? event.amount : 0
      ]
    );
  }

  private async updateProductStats(
    client: PoolClient,
    event: TransactionEvent,
    date: string
  ) {
    if (event.event_type !== 'payment_succeeded') {
      return; // Only count successful payments
    }

    await client.query(
      `INSERT INTO merchant_product_stats (
        merchant_id, date, product_id, product_name,
        transaction_count, total_amount
      ) VALUES ($1, $2, $3, $4, 1, $5)
      ON CONFLICT (merchant_id, date, product_id)
      DO UPDATE SET
        transaction_count = merchant_product_stats.transaction_count + 1,
        total_amount = merchant_product_stats.total_amount + $5,
        updated_at = now()`,
      [event.merchant_id, date, event.product_id, event.product_name, event.amount]
    );
  }

  private async updateCustomerStats(
    client: PoolClient,
    event: TransactionEvent
  ) {
    if (event.event_type !== 'payment_succeeded') {
      return; // Only count successful payments
    }

    // Check if customer exists
    const { rows: existing } = await client.query(
      `SELECT * FROM merchant_customer_stats
       WHERE merchant_id = $1 AND customer_id = $2`,
      [event.merchant_id, event.customer_id]
    );

    if (existing.length === 0) {
      // New customer
      await client.query(
        `INSERT INTO merchant_customer_stats (
          merchant_id, customer_id,
          first_transaction_at, last_transaction_at,
          total_transactions, total_spent, currency
        ) VALUES ($1, $2, $3, $3, 1, $4, $5)`,
        [event.merchant_id, event.customer_id, event.created_at, event.amount, event.currency]
      );

      // Increment new_customers in daily aggregates
      const date = new Date(event.created_at).toISOString().split('T')[0];
      await client.query(
        `UPDATE merchant_daily_aggregates
         SET new_customers = new_customers + 1,
             unique_customers = unique_customers + 1
         WHERE merchant_id = $1 AND date = $2`,
        [event.merchant_id, date]
      );
    } else {
      // Returning customer
      await client.query(
        `UPDATE merchant_customer_stats
         SET last_transaction_at = $3,
             total_transactions = total_transactions + 1,
             total_spent = total_spent + $4,
             updated_at = now()
         WHERE merchant_id = $1 AND customer_id = $2`,
        [event.merchant_id, event.customer_id, event.created_at, event.amount]
      );

      // Increment returning_customers in daily aggregates
      const date = new Date(event.created_at).toISOString().split('T')[0];
      await client.query(
        `UPDATE merchant_daily_aggregates
         SET returning_customers = returning_customers + 1
         WHERE merchant_id = $1 AND date = $2`,
        [event.merchant_id, date]
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run worker if executed directly
if (require.main === module) {
  const worker = new AggregationWorker();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    worker.stop();
    setTimeout(() => process.exit(0), 2000);
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    worker.stop();
    setTimeout(() => process.exit(0), 2000);
  });

  worker.start().catch((error) => {
    console.error('Worker failed:', error);
    process.exit(1);
  });
}

export default AggregationWorker;
