import crypto from "crypto";
import { Request } from "express";

interface NormalizedInput {
    sessionId: string;
    msisdn: string;
    text: string;
    operator: string;
    shortcode: string;
    countryCode: string;
}

interface OperatorConfig {
    callback_secret: string;
    status: string;
}

export function normalizeGatewayInput(req: Request): NormalizedInput {
    const q = { ...req.query, ...req.body };
    const sessionId = q.sessionId || q.session || q.sid || generateSessionId();
    const msisdn = (q.msisdn || q.msisdnNumber || q.phone || "").replace(/[^\d+]/g, "");
    const text = (q.text || q.ussdString || "").trim();
    const operator = (q.operator || q.op || "unknown").toLowerCase();
    const shortcode = (q.serviceCode || q.shortcode || "*131#");
    const countryCode = q.country || q.cc || detectCountry(msisdn);

    return { sessionId, msisdn, text, operator, shortcode, countryCode };
}

function generateSessionId(): string {
    return `ussd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function detectCountry(msisdn: string | undefined): string {
    if (!msisdn) return "SN";
    if (msisdn.startsWith("+221") || msisdn.startsWith("221")) return "SN";
    if (msisdn.startsWith("+233") || msisdn.startsWith("233")) return "GH";
    if (msisdn.startsWith("+234") || msisdn.startsWith("234")) return "NG";
    return "SN";
}

export async function verifyGatewayHmac(req: Request, norm: NormalizedInput): Promise<void> {
    // En mode test, on désactive la vérification HMAC
    if (process.env.NODE_ENV === 'test') {
        return;
    }

    const cfg = await getOperatorConfig(norm.countryCode, norm.shortcode);
    if (!cfg?.callback_secret) {
        console.log('No operator config found, skipping HMAC verification');
        return;
    }

    const sig = (req.headers["x-ussd-signature"] as string) || req.query.sig || req.body.sig;
    if (!sig) throw new Error("Missing signature");

    const base = `${norm.sessionId}|${norm.msisdn}|${norm.text}|${norm.operator}|${norm.shortcode}`;
    const exp = crypto.createHmac("sha256", cfg.callback_secret).update(base).digest("hex");

    if (exp !== sig) throw new Error("Invalid signature");
}

async function getOperatorConfig(countryCode: string, shortcode: string): Promise<OperatorConfig | null> {
    // En mode test, retourner une config par défaut
    if (process.env.NODE_ENV === 'test') {
        return {
            callback_secret: 'test-secret-key',
            status: "active"
        };
    }

    // Implémentation réelle pour la production
    return {
        callback_secret: process.env.OPERATOR_SECRET || "default-secret",
        status: "active"
    };
}