import { pool } from "../store/db";

export interface UserContext {
    userId: number;
    lang: string;
    currency: string;
    country: string;
    tz: string;
    phone: string;
    email: string;
    pushToken: string | null;
    prefs: UserPrefs;
}

export interface UserPrefs {
    push_enabled: boolean;
    sms_enabled: boolean;
    email_enabled: boolean;
    ussd_enabled: boolean;
    quiet_hours: { start: string; end: string };
}

async function getUserPrefs(userId: number): Promise<UserPrefs> {
    const { rows } = await pool.query(
        `SELECT push_enabled, sms_enabled, email_enabled, ussd_enabled, quiet_hours 
     FROM user_notification_prefs WHERE user_id = $1`,
        [userId]
    );

    if (rows.length === 0) {
        return {
            push_enabled: true,
            sms_enabled: true,
            email_enabled: true,
            ussd_enabled: false,
            quiet_hours: { start: "22:00", end: "07:00" }
        };
    }

    return rows[0];
}

export async function resolveUserContext(userId: number): Promise<UserContext> {
    // Simulation - en production, appeler l'API Molam ID
    const { rows } = await pool.query(
        `SELECT lang, currency, country, tz, phone, email, push_token 
     FROM molam_users WHERE id = $1`,
        [userId]
    );

    if (rows.length === 0) {
        throw new Error(`User ${userId} not found`);
    }

    const user = rows[0];
    const prefs = await getUserPrefs(userId);

    return {
        userId,
        lang: user.lang || 'en',
        currency: user.currency || 'USD',
        country: user.country || 'US',
        tz: user.tz || 'UTC',
        phone: user.phone,
        email: user.email,
        pushToken: user.push_token,
        prefs
    };
}