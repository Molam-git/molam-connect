import { q } from "../db.js";

export interface SpamCheckResult {
    blocked: boolean;
    reason?: string;
}

export async function checkSpamAndQuiet(
    userId: string,
    type: string,
    priority: string,
    quietHours?: { start: string; end: string }
): Promise<SpamCheckResult> {

    // 1) Check quiet hours (except for critical notifications)
    if (priority !== "critical" && quietHours) {
        const now = new Date();
        const [startHour, startMin] = String(quietHours.start || "22:00").split(":").map(Number);
        const [endHour, endMin] = String(quietHours.end || "07:00").split(":").map(Number);

        const startTime = new Date(now);
        startTime.setHours(startHour, startMin || 0, 0, 0);

        const endTime = new Date(now);
        endTime.setHours(endHour, endMin || 0, 0, 0);

        // Handle overnight quiet hours
        let inQuietHours = false;
        if (endTime > startTime) {
            inQuietHours = now >= startTime && now <= endTime;
        } else {
            inQuietHours = now >= startTime || now <= endTime;
        }

        if (inQuietHours) {
            return { blocked: true, reason: "quiet_hours" };
        }
    }

    // 2) Rate limits (simplified example)
    const { rows } = await q(
        `SELECT count(*)::int AS count FROM molam_notifications 
     WHERE user_id=$1 AND created_at > now() - interval '1 hour'`,
        [userId]
    );

    const notificationCount = rows[0].count;
    if (notificationCount > 10 && priority !== "critical") {
        return { blocked: true, reason: "rate_limit_hour" };
    }

    // 3) Additional spam checks could be added here
    // (e.g., similar notifications in short time, user blocklist, etc.)

    return { blocked: false };
}