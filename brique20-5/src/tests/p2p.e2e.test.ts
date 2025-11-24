import request from "supertest";
import { app } from "../http/app.js";
import { prisma } from "../infra/db.js";
import { log } from "../infra/logger.js";

// Mock the logger to avoid console noise during tests
jest.mock("../infra/logger.js", () => ({
    log: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

describe("P2P Transfer API", () => {
    const mockUser1 = {
        id: "00000000-0000-0000-0000-000000000001",
        user_type: "customer",
        country: "US",
        kyc_level: "P2",
        is_active: true
    };

    const mockUser2 = {
        id: "00000000-0000-0000-0000-000000000002",
        user_type: "customer",
        country: "US",
        kyc_level: "P2",
        is_active: true
    };

    const mockWallet1 = {
        id: "10000000-0000-0000-0000-000000000001",
        user_id: mockUser1.id,
        currency: "USD",
        balance_cents: 1000000n, // $10,000
        status: "ACTIVE"
    };

    const mockWallet2 = {
        id: "10000000-0000-0000-0000-000000000002",
        user_id: mockUser2.id,
        currency: "USD",
        balance_cents: 500000n, // $5,000
        status: "ACTIVE"
    };

    beforeAll(async () => {
        // Setup test data
        await prisma.molam_users.createMany({
            data: [mockUser1, mockUser2],
            skipDuplicates: true
        });

        await prisma.molam_wallets.createMany({
            data: [mockWallet1, mockWallet2],
            skipDuplicates: true
        });
    });

    afterAll(async () => {
        await prisma.ledger_entries.deleteMany();
        await prisma.revenue_ledger.deleteMany();
        await prisma.wallet_transactions.deleteMany();
        await prisma.idempotency_keys.deleteMany();
        await prisma.molam_wallets.deleteMany();
        await prisma.molam_users.deleteMany();
        await prisma.$disconnect();
    });

    it("should successfully transfer funds and charge 0.90% fee", async () => {
        const idempotencyKey = "test-idem-key-1";

        const response = await request(app)
            .post("/api/pay/p2p/transfer")
            .set("Authorization", "Bearer valid-token")
            .set("Idempotency-Key", idempotencyKey)
            .send({
                receiver_handle: { type: "molam_id", value: mockUser2.id },
                amount: { currency: "USD", value: "100.00" },
                note: "Test transfer",
                client_context: {
                    device_id: "test-device",
                    ip: "192.168.1.1",
                    app_version: "1.0.0"
                }
            });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            status: "SUCCEEDED",
            transaction_id: expect.any(String),
            amount: { currency: "USD", value: "100.00" },
            fee: { currency: "USD", value: expect.any(String) }, // ~0.90
            debited_total: { currency: "USD", value: expect.any(String) }, // ~100.90
            credited_amount: { currency: "USD", value: "100.00" }
        });

        // Verify fee calculation (0.90% of 100.00 = 0.90)
        expect(parseFloat(response.body.fee.value)).toBeCloseTo(0.90, 2);
    });

    it("should return 409 for idempotency conflict with different payload", async () => {
        const idempotencyKey = "test-idem-key-2";

        // First request
        await request(app)
            .post("/api/pay/p2p/transfer")
            .set("Authorization", "Bearer valid-token")
            .set("Idempotency-Key", idempotencyKey)
            .send({
                receiver_handle: { type: "molam_id", value: mockUser2.id },
                amount: { currency: "USD", value: "50.00" }
            });

        // Second request with same key but different amount
        const response = await request(app)
            .post("/api/pay/p2p/transfer")
            .set("Authorization", "Bearer valid-token")
            .set("Idempotency-Key", idempotencyKey)
            .send({
                receiver_handle: { type: "molam_id", value: mockUser2.id },
                amount: { currency: "USD", value: "100.00" } // Different amount
            });

        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({
            error: "idempotency_conflict"
        });
    });

    it("should return 422 for insufficient funds", async () => {
        const response = await request(app)
            .post("/api/pay/p2p/transfer")
            .set("Authorization", "Bearer valid-token")
            .set("Idempotency-Key", "test-idem-key-3")
            .send({
                receiver_handle: { type: "molam_id", value: mockUser2.id },
                amount: { currency: "USD", value: "100000.00" } // Too large
            });

        expect(response.status).toBe(422);
        expect(response.body.error).toBe("insufficient_funds");
    });

    it("should return 422 for self-transfer", async () => {
        const response = await request(app)
            .post("/api/pay/p2p/transfer")
            .set("Authorization", "Bearer valid-token")
            .set("Idempotency-Key", "test-idem-key-4")
            .send({
                receiver_handle: { type: "molam_id", value: mockUser1.id }, // Same as sender
                amount: { currency: "USD", value: "10.00" }
            });

        expect(response.status).toBe(422);
        expect(response.body.error).toBe("self_transfer_not_allowed");
    });
});