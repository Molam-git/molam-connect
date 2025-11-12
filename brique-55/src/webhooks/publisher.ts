/**
 * Webhook Publisher - Integration with B45 Webhooks
 */
import fetch from "node-fetch";

const WEBHOOKS_URL = process.env.WEBHOOKS_URL || "http://localhost:8045";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

/**
 * Publish event to B45 Webhooks system
 */
export async function publishEvent(
  scope: "merchant" | "internal",
  targetId: string,
  eventType: string,
  data: any
): Promise<void> {
  try {
    await fetch(`${WEBHOOKS_URL}/api/events/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        scope,
        target_id: targetId,
        event_type: eventType,
        data,
        timestamp: new Date().toISOString(),
        source: "disputes",
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.error("Failed to publish webhook event:", err);
    // Don't throw - webhook publishing is best-effort
  }
}
