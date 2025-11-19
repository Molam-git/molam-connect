/**
 * Ledger Event Publisher
 * Publishes wallet events to RabbitMQ for ledger processing
 */
import amqp, { Channel, Connection } from 'amqplib';

let connection: Connection | null = null;
let channel: Channel | null = null;

const EXCHANGE_NAME = 'ledger_events';
const EXCHANGE_TYPE = 'topic';

/**
 * Initialize RabbitMQ connection and channel
 */
export async function initPublisher(): Promise<void> {
  if (channel) {
    return; // Already initialized
  }

  try {
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

    console.log('Connecting to RabbitMQ:', rabbitUrl);
    connection = await amqp.connect(rabbitUrl);

    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
    });

    connection.on('close', () => {
      console.warn('RabbitMQ connection closed, reconnecting...');
      channel = null;
      connection = null;
      setTimeout(() => initPublisher(), 5000);
    });

    channel = await connection.createChannel();

    // Assert exchange
    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, {
      durable: true
    });

    console.log('Ledger publisher initialized successfully');
  } catch (error) {
    console.error('Failed to initialize ledger publisher:', error);
    throw error;
  }
}

/**
 * Publish event to ledger exchange
 */
export async function publishLedgerEvent(event: {
  type: string;
  data: any;
  timestamp?: string;
  userId?: string;
}): Promise<void> {
  if (!channel) {
    await initPublisher();
  }

  try {
    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    };

    const payload = Buffer.from(JSON.stringify(eventWithTimestamp));
    const routingKey = event.type || 'wallet.event';

    const published = channel!.publish(
      EXCHANGE_NAME,
      routingKey,
      payload,
      {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now()
      }
    );

    if (!published) {
      console.warn('Event not published (channel buffer full):', event.type);
    }
  } catch (error) {
    console.error('Failed to publish ledger event:', error);
    throw error;
  }
}

/**
 * Close connection gracefully
 */
export async function closePublisher(): Promise<void> {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }

    if (connection) {
      await connection.close();
      connection = null;
    }

    console.log('Ledger publisher closed');
  } catch (error) {
    console.error('Error closing ledger publisher:', error);
  }
}

// Handle process shutdown
process.on('SIGINT', async () => {
  await closePublisher();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePublisher();
  process.exit(0);
});

export default {
  initPublisher,
  publishLedgerEvent,
  closePublisher
};
