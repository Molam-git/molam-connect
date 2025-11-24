import { chooseChannels } from '../../src/services/routing';

// Mock de la base de données
jest.mock('../../src/store/db', () => ({
    pool: {
        query: jest.fn(),
    },
}));

import { pool } from '../../src/store/db';

describe('chooseChannels', () => {
    it('should return channels from country-specific routing', async () => {
        (pool.query as jest.Mock).mockResolvedValueOnce({
            rows: [{ primary_channel: 'sms', fallback_channel: 'push' }],
        });

        const ctx = {
            country: 'SN',
            prefs: { push_enabled: true, sms_enabled: true, email_enabled: true, ussd_enabled: false, quiet_hours: { start: '22:00', end: '07:00' } }
        };

        const channels = await chooseChannels('wallet.p2p.succeeded', ctx as any);

        expect(channels).toEqual(['sms', 'push']);
    });
});