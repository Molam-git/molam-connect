import { q } from "../db.js";

export interface UserPreferences {
    lang: string;
    currency: string;
    country_code?: string;
    channels: Record<string, boolean>;
    marketing_opt_in: boolean;
    quiet_hours?: { start: string; end: string };
}

export async function getUserPrefs(userId: string): Promise<UserPreferences> {
    const { rows } = await q(`
    SELECT lang, currency, country_code, channels, marketing_opt_in, quiet_hours
    FROM user_notification_prefs WHERE user_id=$1
  `, [userId]);

    if (rows.length) return rows[0];

    // Default fallback preferences
    return {
        lang: "en",
        currency: "USD",
        channels: { push: true, sms: true, email: true, ussd: false, whatsapp: false },
        marketing_opt_in: false,
        quiet_hours: { start: "22:00", end: "07:00" }
    };
}