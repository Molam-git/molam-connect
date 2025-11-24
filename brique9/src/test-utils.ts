import { app } from './index';
import { prisma } from './shared/prisma';

export async function startApp() {
    const testApp = app;
    const token = 'test-jwt-token'; // Mock JWT for testing

    return { app: testApp, token };
}

export async function cleanupTestData() {
    // Clean up test data after tests
    await prisma.molam_bill_payments.deleteMany({ where: { idempotency_key: { contains: 'test-' } } });
    await prisma.molam_bill_accounts.deleteMany({ where: { customer_ref: { contains: 'test-' } } });
}