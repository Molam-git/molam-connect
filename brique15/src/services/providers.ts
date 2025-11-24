import { Pool } from 'pg';
import { getPrimaryEndpoint } from './store';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function sendEmail(userId: string, subject: string, html: string) {
    const { endpoint } = await getPrimaryEndpoint(userId, 'email');
    const id = await fakeProviderCall('email', { to: endpoint, subject, html });
    return id;
}

export async function sendSMS(userId: string, text: string) {
    const { endpoint } = await getPrimaryEndpoint(userId, 'sms');
    const id = await fakeProviderCall('sms', { to: endpoint, text });
    return id;
}

export async function sendPush(userId: string, title: string, body: string) {
    const { endpoint } = await getPrimaryEndpoint(userId, 'push');
    const id = await fakeProviderCall('push', { token: endpoint, title, body });
    return id;
}

export async function storeInApp(userId: string, eventKey: string, title: string, body: string, locale: string) {
    const res = await db.query(`
    INSERT INTO inapp_notifications (user_id, event_key, title, body, locale)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING inapp_id
  `, [userId, eventKey, title, body, locale]);
    return `inapp:${res.rows[0].inapp_id}`;
}

export async function sendUSSD(userId: string, text: string) {
    return `ussd:${Date.now()}`;
}

async function fakeProviderCall(channel: string, payload: any) {
    return `${channel}-${Math.random().toString(36).slice(2, 10)}`;
}