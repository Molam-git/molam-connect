// tests/agents.test.ts
import test, { describe } from 'node:test';
import { initCashIn, confirmCashIn, initCashOut, confirmCashOut } from '../src/agents/service';

describe('Agents API', () => {
    test('CASHIN_SELF should have zero fee', async () => {
        // Test implementation
    });

    test('CASHIN_OTHER should calculate fee', async () => {
        // Test implementation  
    });

    test('CASHOUT should be free', async () => {
        // Test implementation
    });

    test('Idempotency key should prevent duplicates', async () => {
        // Test implementation
    });
});