/**
 * Webhook event publisher - integrates with B45 Webhooks
 */
import fetch from "node-fetch";

const WEBHOOKS_URL = process.env.WEBHOOKS_URL || "http://localhost:8045";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

export async function publishEvent(
  scope: string,
  scopeId: string,
  eventType: string,
  payload: any
): Promise<void> {
  try {
    await fetch(`${WEBHOOKS_URL}/internal/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        scope,
        scope_id: scopeId,
        event_type: eventType,
        payload,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error("Failed to publish webhook event:", err);
    // Don't throw - webhook publishing is best-effort
  }
}
