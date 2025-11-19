/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Queue Utility - Enqueue incident checks for async processing
 * 
 * In production, this would use Kafka/RabbitMQ/Redis Queue
 * For now, simplified in-memory queue
 */

import { pool } from "../db";

interface IncidentCheckMessage {
  pluginId: string;
  merchantId: string;
  telemetry: any;
}

// In-memory queue (replace with Kafka/RabbitMQ in production)
const incidentQueue: IncidentCheckMessage[] = [];

/**
 * Enqueue incident check for async processing
 */
export async function enqueueIncidentCheck(message: IncidentCheckMessage): Promise<void> {
  // In production, publish to Kafka/RabbitMQ
  // For now, add to in-memory queue
  
  incidentQueue.push(message);
  
  // Trigger processing if worker is running
  // (Worker will poll this queue)
}

/**
 * Dequeue incident check (called by worker)
 */
export async function dequeueIncidentCheck(): Promise<IncidentCheckMessage | null> {
  if (incidentQueue.length === 0) {
    return null;
  }
  
  return incidentQueue.shift() || null;
}

/**
 * Get queue size (for monitoring)
 */
export function getQueueSize(): number {
  return incidentQueue.length;
}

// Export queue for worker access
export { incidentQueue };



