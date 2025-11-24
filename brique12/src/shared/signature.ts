import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

export function verifyHmac() {
    return (req: Request, res: Response, next: NextFunction) => {
        const sig = req.header("x-molam-signature") || "";
        const secret = process.env.WEBHOOK_SECRET || "default-secret-change-in-prod";
        const h = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");

        if (crypto.timingSafeEqual(Buffer.from(h), Buffer.from(sig))) {
            return next();
        }

        return res.status(401).json({ error: "bad_signature" });
    };
}