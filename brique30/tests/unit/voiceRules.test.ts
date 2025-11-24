import { loadRule } from '../../src/lib/ruleLoader';
import { pool } from '../../src/db';

jest.mock('../../src/db');

describe('Voice Rules', () => {
    it('should load rule for country and region', async () => {
        const mockRule = {
            id: 1,
            country: 'SN',
            region: 'CEDEAO',
            fallback_enabled: true,
            fallback_delay_seconds: 30,
            max_message_seconds: 60
        };

        (pool.query as jest.Mock).mockResolvedValue({ rows: [mockRule] });

        const rule = await loadRule('SN', 'CEDEAO', 'Dakar');
        expect(rule).toEqual(mockRule);
    });

    it('should return default rule if no rule found', async () => {
        (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

        const rule = await loadRule('SN', 'CEDEAO', 'Dakar');
        expect(rule).toEqual({
            fallback_enabled: true,
            fallback_delay_seconds: 60,
            max_message_seconds: 60
        });
    });
});