import { Server } from "socket.io";
import http from "http";
import jwt from "jsonwebtoken";

export default class WebSocketServer {
    static io: Server;

    static init(server?: http.Server): Server {
        if (this.io) return this.io;
        const s = server || http.createServer();
        this.io = new Server(s, {
            path: "/ws",
            cors: {
                origin: process.env.CORS_ORIGIN || "*",
                methods: ["GET", "POST"]
            }
        });

        this.io.use((socket, next) => {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error("auth required"));
            try {
                const payload = jwt.verify(token, process.env.MOLAM_ID_JWT_PUBLIC as string) as any;
                (socket as any).user = payload;
                next();
            } catch (e) {
                next(new Error("invalid_token"));
            }
        });

        this.io.on("connection", (socket) => {
            console.log("ws conn", (socket as any).user?.sub);
            // subscribe to channels: agentId, zone, country, role
            const user = (socket as any).user;
            if (user.agent_id) socket.join(`agent:${user.agent_id}`);
            if (user.country) socket.join(`country:${user.country}`);
            if (user.zone) socket.join(`zone:${user.zone}`);
            if (user.roles) {
                user.roles.forEach((role: string) => {
                    socket.join(`role:${role}`);
                });
            }
        });

        return this.io;
    }

    static broadcastToRelevantClients(payload: any, dims: { agentId?: number, country?: string, zone?: string }) {
        if (!this.io) return;
        if (dims.agentId) this.io.to(`agent:${dims.agentId}`).emit("update", payload);
        if (dims.country) this.io.to(`country:${dims.country}`).emit("update", payload);
        if (dims.zone) this.io.to(`zone:${dims.zone}`).emit("update", payload);
        // fallback broadcast to admins
        this.io.to("role:pay_admin").emit("update", payload);
    }
}

// Type definitions
declare module "socket.io" {
    interface Server {
        // Add any custom methods if needed
    }
}