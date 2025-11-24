import { computePlans } from '../src/float/policyEngine';
import { db } from '../src/float/db';
import test from 'node:test';

test('creates plans when account below min_target and another above max', async () => {
    // Arrange: make A deficit, B surplus
    await db.none(`UPDATE float_balances SET balance_available=5000 WHERE account_id=(SELECT id FROM float_accounts ORDER BY id LIMIT 1)`);
    await db.none(`UPDATE float_balances SET balance_available=250000 WHERE account_id=(SELECT id FROM float_accounts ORDER BY id OFFSET 1 LIMIT 1)`);

    const plans = await computePlans('USD');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0].amount).toBeGreaterThan(0);
});

test('returns empty array when no imbalances', async () => {
    // Arrange: set all accounts within targets
    await db.none(`UPDATE float_balances SET balance_available=50000`);

    const plans = await computePlans('USD');
    expect(plans.length).toBe(0);
});