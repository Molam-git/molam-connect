import { getUserPrefs, UserPreferences } from "./preferences.js";
import type { NotificationChannel, NotificationType, NotificationPriority } from "./engine.js";

export interface SiraDecision {
    channels: NotificationChannel[];
    priority: NotificationPriority;
    locale: string;
    currency: string;
}

export async function siraDecide(
    userId: string,
    payload: {
        type: NotificationType;
        suggestedChannels?: NotificationChannel[];
        basePriority?: NotificationPriority;
    }
): Promise<SiraDecision> {

    const prefs = await getUserPrefs(userId);

    // Priority heuristic
    let priority: NotificationPriority = payload.basePriority || "normal";
    if (payload.type === "security") priority = "critical";
    if (payload.type === "txn") priority = priority === "normal" ? "high" : priority;
    if (payload.type === "reward") priority = "low";
    if (payload.type === "bill") priority = "normal";
    if (payload.type === "system") priority = "normal";

    // Channel routing: intersect suggested channels with user preferences
    const enabledChannels = Object.entries(prefs.channels)
        .filter(([_, enabled]) => enabled)
        .map(([channel]) => channel as NotificationChannel);

    const channels: NotificationChannel[] = (payload.suggestedChannels?.length
        ? payload.suggestedChannels
        : ["push", "sms", "email"] as NotificationChannel[]
    ).filter(channel => enabledChannels.includes(channel));

    // Fallback to push if no channels available
    if (!channels.length) {
        channels.push("push");
    }

    return {
        channels,
        priority,
        locale: prefs.lang,
        currency: prefs.currency
    };
}