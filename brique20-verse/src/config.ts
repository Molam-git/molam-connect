export const config = {
    db: {
        client: 'pg',
        connection: process.env.DATABASE_URL!
    },
    payouts: {
        highAmountApprovalUSD: 2000,
        defaultMinThreshold: 10
    },
    security: {
        webhookSecret: process.env.WEBHOOK_SECRET!,
        providerMtlsCert: process.env.PROVIDER_CLIENT_CERT_PATH!,
        providerMtlsKey: process.env.PROVIDER_CLIENT_KEY_PATH!
    }
};