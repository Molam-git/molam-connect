import { startApp, cleanupTestData } from '../src/test-utils';

describe('Bills API', () => {
    let app: any;
    let token: string;

    beforeAll(async () => {
        ({ app, token } = await startApp());
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it('should create a bill account and pay with idempotency', async () => {
        // Mock biller data would be seeded in test DB
        const billerResponse = await app.inject({
            method: 'GET',
            url: '/v1/billers?country=SN',
            headers: {
                authorization: `Bearer ${token}`
            }
        });

        expect(billerResponse.statusCode).toBe(200);
        const billers = JSON.parse(billerResponse.body);
        expect(Array.isArray(billers)).toBe(true);

        if (billers.length > 0) {
            const biller = billers[0];

            const accountResponse = await app.inject({
                method: 'POST',
                url: '/v1/accounts',
                headers: {
                    authorization: `Bearer ${token}`
                },
                payload: {
                    billerId: biller.biller_id,
                    customerRef: 'test-12345678',
                    country: 'SN'
                }
            });

            expect(accountResponse.statusCode).toBe(201);
            const account = JSON.parse(accountResponse.body);

            const idemKey = 'test-idem-abc-001';
            const payResponse1 = await app.inject({
                method: 'POST',
                url: '/v1/payments',
                headers: {
                    authorization: `Bearer ${token}`,
                    'idempotency-key': idemKey
                },
                payload: {
                    accountId: account.account_id,
                    amount: 1000,
                    currency: biller.currency,
                    walletId: 'test-wallet-1'
                }
            });

            expect(payResponse1.statusCode).toBe(201);
            const payment1 = JSON.parse(payResponse1.body);

            const payResponse2 = await app.inject({
                method: 'POST',
                url: '/v1/payments',
                headers: {
                    authorization: `Bearer ${token}`,
                    'idempotency-key': idemKey
                },
                payload: {
                    accountId: account.account_id,
                    amount: 1000,
                    currency: biller.currency,
                    walletId: 'test-wallet-1'
                }
            });

            expect(payResponse2.statusCode).toBe(201);
            const payment2 = JSON.parse(payResponse2.body);

            expect(payment1.billPaymentId).toEqual(payment2.billPaymentId);
        }
    });

    it('should reject payment without idempotency key', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/payments',
            headers: {
                authorization: `Bearer ${token}`
            },
            payload: {
                accountId: 'test-account',
                amount: 1000,
                currency: 'XOF',
                walletId: 'test-wallet-1'
            }
        });

        expect(response.statusCode).toBe(400);
    });
});