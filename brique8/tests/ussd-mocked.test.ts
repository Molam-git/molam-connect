import request from "supertest";
import app from "../src/ussd/server";

// Mock complet de toutes les dépendances
jest.mock('../src/ussd/util/profile', () => ({
    fetchOrCreateMsisdnProfile: jest.fn().mockResolvedValue({
        user_id: 'test-user-id',
        country_code: 'SN',
        currency: 'XOF',
        language: 'fr',
        is_verified: true
    })
}));

jest.mock('../src/ussd/util/redisSession', () => {
    const mockSessions = new Map();
    return {
        getSession: jest.fn().mockImplementation((sessionId, prof, lang) => {
            if (!mockSessions.has(sessionId)) {
                mockSessions.set(sessionId, {
                    sessionId,
                    state: 'HOME',
                    lang: prof.language || lang,
                    country_code: prof.country_code,
                    currency: prof.currency,
                    ctx: {},
                    tries: { pin: 0 }
                });
            }
            return Promise.resolve(mockSessions.get(sessionId));
        }),
        setSession: jest.fn().mockImplementation((sessionId, session) => {
            mockSessions.set(sessionId, session);
            return Promise.resolve();
        }),
        clearSession: jest.fn().mockResolvedValue(undefined)
    };
});

jest.mock('../src/ussd/util/ratelimit', () => ({
    rateLimitCheck: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../src/ussd/util/pin', () => ({
    verifyPin: jest.fn().mockResolvedValue(true),
    requirePinIfSensitive: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../src/ussd/util/wallet', () => ({
    walletBalance: jest.fn().mockResolvedValue(12500.00),
    p2pPreviewFees: jest.fn().mockResolvedValue({ totalFees: 50 }),
    p2pTransfer: jest.fn().mockResolvedValue('TRX-123456'),
    cashinInit: jest.fn().mockResolvedValue({ reference: 'CI-123456' }),
    withdrawInit: jest.fn().mockResolvedValue('WD-123456')
}));

jest.mock('../src/ussd/util/audit', () => ({
    audit: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../src/ussd/us/gateway', () => ({
    normalizeGatewayInput: jest.fn().mockImplementation((req) => ({
        sessionId: req.body.sessionId || 'mock-session',
        msisdn: req.body.msisdn || '+221770000000',
        text: req.body.text || '',
        operator: req.body.operator || 'orange',
        shortcode: req.body.serviceCode || '*131#',
        countryCode: 'SN'
    })),
    verifyGatewayHmac: jest.fn().mockResolvedValue(undefined)
}));

describe("USSD Service with Complete Mocks", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("USSD home menu should display options", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-home",
                msisdn: "+221770000000",
                text: "",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("CON");
        expect(res.text).toContain("Molam");
        expect(res.text).toContain("Solde");
        expect(res.text).toContain("Recharge");
        expect(res.text).toContain("Transfert");
        expect(res.text).toContain("Retrait");
        expect(res.text).toContain("Réinitialiser PIN");
        expect(res.text).toContain("Quitter");
    });

    test("Balance option should ask for PIN", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-balance",
                msisdn: "+221770000000",
                text: "1",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("PIN");
    });

    test("P2P flow should ask for destination", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-p2p",
                msisdn: "+221770000000",
                text: "3",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("destinataire");
    });

    test("P2P flow should handle destination and amount", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-p2p-flow",
                msisdn: "+221770000000",
                text: "3*771234567*5000",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("CON");
        expect(res.text).toContain("PIN");
    });

    test("Cash-in flow should ask for agent code", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-cashin",
                msisdn: "+221770000000",
                text: "2",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("agent");
    });

    test("Withdrawal flow should ask for amount", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-withdraw",
                msisdn: "+221770000000",
                text: "4",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("retirer");
    });

    test("PIN reset should redirect", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-pin-reset",
                msisdn: "+221770000000",
                text: "99",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("END");
        expect(res.text).toContain("OTP");
    });

    test("Quit option should end session", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-quit",
                msisdn: "+221770000000",
                text: "0",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("END");
        expect(res.text).toContain("Merci");
    });

    test("Invalid option should show error", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-invalid",
                msisdn: "+221770000000",
                text: "999",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("invalide");
    });

    test("Direct balance shortcut should work", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-direct-balance",
                msisdn: "+221770000000",
                text: "",
                operator: "orange",
                serviceCode: "*131*1#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("PIN");
    });

    test("Direct transfer shortcut should work", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-direct-transfer",
                msisdn: "+221770000000",
                text: "",
                operator: "orange",
                serviceCode: "*131*3#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("destinataire");
    });

    test("Health check should work", async () => {
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "OK", service: "ussd" });
    });
});