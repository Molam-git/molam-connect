import { db } from "../util/db";

export interface SIRAInput {
    user_id: string;
    wallet_id: string;
    amount: number;
    currency: string;
    channel: string;
    country_code: string;
    device?: any;
}

export interface SIRAResponse {
    decision: "allow" | "review" | "block";
    reason?: string;
    risk_score?: number;
}

export async function siraEvaluateTopup(input: SIRAInput): Promise<SIRAResponse> {
    // Velocity checks
    const velocityCheck = await checkVelocity(input);
    if (!velocityCheck.allowed) {
        return { decision: "block", reason: velocityCheck.reason };
    }

    // Device fingerprint checks
    const deviceCheck = await checkDevice(input);
    if (!deviceCheck.allowed) {
        return { decision: "review", reason: deviceCheck.reason };
    }

    // Amount-based risk assessment
    if (input.amount > 10000) {
        return { decision: "review", reason: "High amount requires manual review" };
    }

    // Blacklist checks
    const blacklistCheck = await checkBlacklists(input);
    if (blacklistCheck.blocked) {
        return { decision: "block", reason: "User or device in blacklist" };
    }

    return { decision: "allow", risk_score: calculateRiskScore(input) };
}

async function checkVelocity(input: SIRAInput) {
    // Check transaction frequency and amounts
    const recentTxCount = await db.oneOrNone(
        `SELECT COUNT(*) as count FROM molam_topups 
     WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
        [input.user_id]
    );

    if (recentTxCount > 5) {
        return { allowed: false, reason: "Too many transactions in short period" };
    }

    return { allowed: true };
}

async function checkDevice(input: SIRAInput) {
    // Implement device fingerprint validation
    if (!input.device?.fingerprint) {
        return { allowed: false, reason: "Device fingerprint missing" };
    }

    // Check for suspicious device patterns
    const suspiciousDevice = await db.oneOrNone(
        `SELECT * FROM molam_risk_devices WHERE fingerprint = $1 AND blocked = true`,
        [input.device.fingerprint]
    );

    if (suspiciousDevice) {
        return { allowed: false, reason: "Suspicious device detected" };
    }

    return { allowed: true };
}

async function checkBlacklists(input: SIRAInput) {
    // Check user against sanctions lists
    const sanctioned = await db.oneOrNone(
        `SELECT * FROM molam_sanctions WHERE user_id = $1`,
        [input.user_id]
    );

    return { blocked: !!sanctioned };
}

function calculateRiskScore(input: SIRAInput): number {
    let score = 0;

    // Amount-based risk
    if (input.amount > 5000) score += 30;
    if (input.amount > 10000) score += 40;

    // Channel-based risk
    if (input.channel === 'crypto') score += 20;
    if (input.channel === 'card') score += 10;

    // Time-based risk (late night transactions)
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 6) score += 15;

    return Math.min(score, 100);
}