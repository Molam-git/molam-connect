// tests/integration/notifications.int.spec.ts
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock providers
jest.mock('../../src/services/providerAdapters/twilioSms', () => ({
    sendTwilioSms: jest.fn(async (cfg, to, body) => ({
        success: true,
        raw: { id: 'twilio-test', sid: 'SM123' }
    }))
}));

jest.mock('../../src/services/providerAdapters/localSms', () => ({
    sendLocalSms: jest.fn(async (cfg, to, body) => ({
        success: true,
        raw: { id: 'local-test', messageId: 'local-123' }
    }))
}));

jest.mock('../../src/services/sira', () => ({
    publishSiraEvent: jest.fn(async (evt: any) => {
        console.log('SIRA event published:', evt);
        return true;
    })
}));

// Mock database
const mockDb = {
    queries: [] as any[],
    notifications: new Map(),
    zones: new Map(),
    audit: [] as any[],
    metrics: [] as any[],
    providers: [] as any[]
};

jest.mock('../../src/db', () => ({
    pool: {
        connect: jest.fn(() => Promise.resolve({
            query: jest.fn(async (text: string, params?: any[]) => {
                mockDb.queries.push({ text, params });

                // Handle different query types
                if (text.includes('INSERT INTO notifications')) {
                    const id = params?.[0];
                    mockDb.notifications.set(id, {
                        id,
                        user_id: params?.[1],
                        agent_id: params?.[2],
                        channel: params?.[3],
                        zone_code: params?.[4],
                        language: params?.[5],
                        currency: params?.[6],
                        payload: params?.[7],
                        priority: params?.[8],
                        status: 'pending',
                        provider_attempts: [],
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                    return { rows: [], rowCount: 1 };
                }

                if (text.includes('SELECT * FROM notification_zones')) {
                    const zoneCode = params?.[0];
                    const zone = mockDb.zones.get(zoneCode) || {
                        zone_code: zoneCode,
                        prefer_sms: true,
                        max_retries: 3,
                        max_backoff_sec: 60,
                        min_fee: 0.01,
                        max_fee: 2.0,
                        pricing_markup_pct: 0
                    };
                    return { rows: [zone], rowCount: 1 };
                }

                if (text.includes('SELECT id, user_id') && text.includes('FROM notifications')) {
                    const id = params?.[0];
                    const notification = mockDb.notifications.get(id);
                    return { rows: notification ? [notification] : [], rowCount: notification ? 1 : 0 };
                }

                if (text.includes('INSERT INTO notification_audit')) {
                    mockDb.audit.push({
                        notification_id: params?.[0],
                        actor: params?.[1],
                        action: params?.[2],
                        details: params?.[3]
                    });
                    return { rows: [], rowCount: 1 };
                }

                if (text.includes('UPDATE notifications SET provider_attempts')) {
                    const id = params?.[1];
                    const notification = mockDb.notifications.get(id);
                    if (notification) {
                        notification.provider_attempts = params?.[0];
                    }
                    return { rows: [], rowCount: 1 };
                }

                if (text.includes('UPDATE notifications SET status')) {
                    const id = params?.[0];
                    const notification = mockDb.notifications.get(id);
                    if (notification) {
                        notification.status = 'delivered';
                    }
                    return { rows: [], rowCount: 1 };
                }

                // Default response
                return { rows: [], rowCount: 0 };
            }),
            release: jest.fn()
        })),
        query: jest.fn(async (text: string, params?: any[]) => {
            return { rows: [], rowCount: 0 };
        })
    }
}));

import app from '../../src/server';
import { runOnce } from '../../src/worker/deliveryWorker';

describe('Notifications Integration', () => {
    beforeEach(() => {
        mockDb.queries = [];
        mockDb.notifications.clear();
        mockDb.zones.clear();
        mockDb.audit = [];
        mockDb.metrics = [];

        // Setup test zone
        mockDb.zones.set('SN-DKR', {
            zone_code: 'SN-DKR',
            prefer_sms: true,
            max_retries: 3,
            max_backoff_sec: 60,
            min_fee: 0.01,
            max_fee: 2.0,
            pricing_markup_pct: 0
        });

        // Setup test providers
        mockDb.providers = [
            {
                id: 'provider-1',
                name: 'twilio_sms',
                channel: 'sms',
                zone_code: 'SN-DKR',
                priority: 1,
                base_cost: 0.02,
                currency: 'USD',
                is_active: true,
                config: { api_url: 'https://api.twilio.com', from: '+1234567890' }
            },
            {
                id: 'provider-2',
                name: 'local_sms_gw',
                channel: 'sms',
                zone_code: null, // global
                priority: 2,
                base_cost: 0.01,
                currency: 'USD',
                is_active: true,
                config: { endpoint: 'https://local-sms.com' }
            }
        ];
    });

    it('should create notification via API and deliver via worker', async () => {
        // 1) Send notification via API
        const payload = {
            user_id: '00000000-0000-0000-0000-000000000001',
            channel: 'sms',
            payload: { to: '+221770000000', body: 'Votre code: 1234' },
            zone_code: 'SN-DKR'
        };

        const res = await request(app)
            .post('/api/notifications/send')
            .set('Authorization', 'Bearer test.jwt')
            .send(payload)
            .expect(202);

        expect(res.body.id).toBeDefined();
        expect(res.body.status).toBe('queued');

        const notificationId = res.body.id;

        // Verify notification was created
        expect(mockDb.notifications.has(notificationId)).toBe(true);

        // 2) Run worker to process the notification
        await runOnce();

        // 3) Verify notification was processed
        const notification = mockDb.notifications.get(notificationId);
        expect(notification).toBeDefined();
        expect(notification.status).toBe('delivered');
        expect(notification.provider_attempts.length).toBeGreaterThan(0);

        // 4) Verify audit trail was created
        const auditEntries = mockDb.audit.filter(a => a.notification_id === notificationId);
        expect(auditEntries.length).toBeGreaterThan(0);

        // Should have create and send_attempt audit entries
        const createAudit = auditEntries.find(a => a.action === 'create');
        const attemptAudit = auditEntries.find(a => a.action === 'send_attempt');

        expect(createAudit).toBeDefined();
        expect(attemptAudit).toBeDefined();
    });

    it('should respect zone preferences', async () => {
        // Test zone with SMS preference
        mockDb.zones.set('SN-DKR', {
            zone_code: 'SN-DKR',
            prefer_sms: true,
            max_retries: 3,
            max_backoff_sec: 60,
            min_fee: 0.01,
            max_fee: 2.0,
            pricing_markup_pct: 0
        });

        const res = await request(app)
            .post('/api/notifications/send')
            .set('Authorization', 'Bearer test.jwt')
            .send({
                channel: 'sms',
                payload: { to: '+221770000000', body: 'Test SMS' },
                zone_code: 'SN-DKR'
            })
            .expect(202);

        await runOnce();

        // Verify SMS providers were used
        const notification = mockDb.notifications.get(res.body.id);
        expect(notification.provider_attempts[0].provider).toContain('sms');
    });
});