/**
 * BRIQUE 145 — WebSocket Real-time Analytics
 * Socket.IO server for live dashboard updates
 */
import { Server } from "socket.io";
import { createServer } from "http";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { Counter, register } from "prom-client";

dotenv.config();

const PORT = process.env.WS_PORT || 3003;
const MOLAM_ID_PUBLIC_KEY = process.env.MOLAM_ID_PUBLIC_KEY || "";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redis = new Redis(REDIS_URL);
const subscriber = new Redis(REDIS_URL);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true
  }
});

// Metrics
const connectionCounter = new Counter({
  name: "analytics_ws_connections_total",
  help: "Total WebSocket connections",
  labelNames: ["status"]
});

const messageCounter = new Counter({
  name: "analytics_ws_messages_total",
  help: "Total messages sent to clients",
  labelNames: ["room"]
});

/**
 * Verify Molam ID JWT token
 */
function verifyToken(token: string): any {
  if (!MOLAM_ID_PUBLIC_KEY) {
    throw new Error("MOLAM_ID_PUBLIC_KEY not configured");
  }
  try {
    return jwt.verify(token, MOLAM_ID_PUBLIC_KEY, {
      algorithms: ["RS256", "ES256"]
    });
  } catch (error: any) {
    throw new Error(`Invalid token: ${error.message}`);
  }
}

/**
 * Check if user has required role
 */
function hasRole(userRoles: string[], allowedRoles: string[]): boolean {
  return userRoles.some(role => allowedRoles.includes(role));
}

// Authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error("authentication_error: missing token"));
  }

  try {
    const payload = verifyToken(token);
    socket.data.user = payload;
    connectionCounter.inc({ status: "authenticated" });
    next();
  } catch (error: any) {
    connectionCounter.inc({ status: "rejected" });
    return next(new Error(`authentication_error: ${error.message}`));
  }
});

// Connection handler
io.on("connection", (socket) => {
  const user = socket.data.user;
  console.log(`✅ Client connected: ${user.sub} (roles: ${user.roles?.join(", ")})`);

  /**
   * Subscribe to analytics updates by filter
   * Rooms: global, zone:{zone}, country:{country}, city:{city}
   */
  socket.on("subscribe", (filter: {
    zone?: string;
    country?: string;
    city?: string;
  }) => {
    // RBAC check
    const allowedRoles = ["pay_admin", "finance_ops", "merchant_admin", "auditor"];
    if (!hasRole(user.roles || [], allowedRoles)) {
      socket.emit("error", { message: "forbidden: insufficient permissions" });
      return;
    }

    // Leave all existing rooms first
    socket.rooms.forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
      }
    });

    // Join appropriate rooms based on filter
    if (filter.city) {
      const room = `city:${filter.city}`;
      socket.join(room);
      console.log(`📍 ${user.sub} subscribed to ${room}`);
    } else if (filter.country) {
      const room = `country:${filter.country}`;
      socket.join(room);
      console.log(`🌍 ${user.sub} subscribed to ${room}`);
    } else if (filter.zone) {
      const room = `zone:${filter.zone}`;
      socket.join(room);
      console.log(`🗺️  ${user.sub} subscribed to ${room}`);
    } else {
      socket.join("global");
      console.log(`🌐 ${user.sub} subscribed to global`);
    }

    socket.emit("subscribed", { filter, timestamp: new Date().toISOString() });
  });

  socket.on("disconnect", () => {
    console.log(`❌ Client disconnected: ${user.sub}`);
  });
});

/**
 * Redis subscriber: Listen to analytics.delta and broadcast to rooms
 */
subscriber.subscribe("analytics.delta", (err) => {
  if (err) {
    console.error("❌ Failed to subscribe to Redis channel:", err);
    process.exit(1);
  }
  console.log("📡 Subscribed to analytics.delta channel");
});

subscriber.on("message", (channel, message) => {
  try {
    const delta = JSON.parse(message);

    // Broadcast to appropriate rooms
    const rooms = ["global"];

    if (delta.zone) {
      rooms.push(`zone:${delta.zone}`);
    }
    if (delta.country) {
      rooms.push(`country:${delta.country}`);
    }
    if (delta.city) {
      rooms.push(`city:${delta.city}`);
    }

    rooms.forEach(room => {
      io.to(room).emit("analytics:delta", delta);
      messageCounter.inc({ room });
    });
  } catch (error) {
    console.error("❌ Error processing Redis message:", error);
  }
});

// Metrics endpoint
httpServer.on("request", async (req, res) => {
  if (req.url === "/metrics") {
    res.setHeader("Content-Type", register.contentType);
    res.end(await register.metrics());
  } else if (req.url === "/healthz") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, service: "analytics-ws" }));
  }
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down WebSocket server...");
  io.close();
  await redis.quit();
  await subscriber.quit();
  process.exit(0);
});

httpServer.listen(PORT, () => {
  console.log(`🔌 WebSocket server running on port ${PORT}`);
});
