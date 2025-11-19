// ============================================================================
// FX Aggregator WebSocket Server
// ============================================================================

import { WebSocketServer, WebSocket } from "ws";
import Redis from "ioredis";
import { getQuote } from "../services/fx-service";

const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
const subscriber = redis.duplicate();

export function startWSServer(port: number = 8081) {
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[FX WS] Client connected");

    ws.on("message", (msg: string) => {
      try {
        const { action, pairs } = JSON.parse(msg.toString());
        if (action === "subscribe" && Array.isArray(pairs)) {
          // Subscribe to Redis pub/sub for rate updates
          pairs.forEach((pair: string) => {
            subscriber.subscribe(`fx:update:${pair}`, (message) => {
              ws.send(JSON.stringify({ type: "rate_update", pair, data: JSON.parse(message) }));
            });
          });
          ws.send(JSON.stringify({ type: "subscribed", pairs }));
        }
      } catch (e: any) {
        console.error("[FX WS] Parse error:", e.message);
      }
    });

    ws.on("close", () => {
      console.log("[FX WS] Client disconnected");
    });
  });

  console.log(`[FX WS] Server listening on port ${port}`);
}

// Start if run directly
if (require.main === module) {
  startWSServer();
}
