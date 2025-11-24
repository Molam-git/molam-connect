import { selectProviderFor } from '../../src/lib/providerSelector';
import { pool } from '../../src/db';

jest.mock('../../src/db');

describe('Provider Selector', () => {
    it('should select provider for country and language', async () => {
        const mockProvider = {
            id: 'twilio',
            name: 'Twilio',
            endpoint: 'https://api.twilio.com',
            per_minute_usd: 0.05,
            supported_langs: ['en', 'fr'],
            regions_supported: ['US', 'SN'],
            is_active: true
        };

        (pool.query as jest.Mock).mockResolvedValue({ rows: [mockProvider] });

        const provider = await selectProviderFor('SN', 'fr');
        expect(provider).toEqual(mockProvider);
    });

    it('should return null if no provider found', async () => {
        (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

        const provider = await selectProviderFor('SN', 'fr');
        expect(provider).toBeNull();
    });
});