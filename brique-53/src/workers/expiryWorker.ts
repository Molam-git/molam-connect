/**
 * Session expiry worker
 * Marks expired sessions as expired
 */
import { pool } from "../utils/db.js";
import { publishEvent } from "../webhooks/publisher.js";

export async function startExpiryWorker(): Promise<void> {
  console.log("Session expiry worker started");

  setInterval(async () => {
    await expireOldSessions();
  }, 60000); // Run every minute
}

async function expireOldSessions(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `UPDATE checkout_sessions
       SET status = 'expired', updated_at = now()
       WHERE status IN ('created', 'requires_action')
         AND expires_at <= now()
       RETURNING id, merchant_id`
    );

    for (const session of rows) {
      console.log(`Expired session ${session.id}`);

      await publishEvent("merchant", session.merchant_id, "checkout.session.expired", {
        session_id: session.id,
      });

      // Log event
      await pool.query(
        `INSERT INTO checkout_events (session_id, event_type, event_data)
         VALUES ($1, 'session.expired', '{}'::jsonb)`,
        [session.id]
      );
    }

    if (rows.length > 0) {
      console.log(`Expired ${rows.length} checkout sessions`);
    }
  } catch (err) {
    console.error("Failed to expire sessions:", err);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startExpiryWorker().catch(console.error);
}
