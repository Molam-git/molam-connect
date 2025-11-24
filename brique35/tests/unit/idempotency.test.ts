import { checkIdempotency, saveIdempotency } from '../../src/utils/idempotency';
import { pool } from '../../src/db';

describe('Idempotency', () => {
    afterEach(async () => {
        await pool.query('DELETE FROM idempotency_keys');
    });

    it('should save and retrieve idempotency key', async () => {
        const key = 'test-key';
        const response = { payoutId: '123', reference: 'TEST-123' };

        await saveIdempotency(key, response, 'user-1');

        const retrieved = await checkIdempotency(key);
        expect(retrieved).toEqual(response);
    });

    it('should return null for non-existent key', async () => {
        const retrieved = await checkIdempotency('non-existent');
        expect(retrieved).toBeNull();
    });
});