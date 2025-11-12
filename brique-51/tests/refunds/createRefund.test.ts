/**
 * Brique 51 - Refunds & Reversals
 * Test: Create Refund
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { pool } from "../../src/utils/db.js";
import { createRefund } from "../../src/services/refundService.js";

describe("Refund Service", () => {
  beforeAll(async () => {
    // Ensure database is connected
    await pool.query("SELECT 1");
  });

  afterAll(async () => {
    // Cleanup
    await pool.end();
  });

  test("should create refund with idempotency", async () => {
    const input = {
      paymentId: "test-payment-123",
      originModule: "connect",
      initiator: "merchant" as const,
      initiatorId: "merchant-456",
      type: "refund" as const,
      amount: 100.0,
      currency: "USD",
      reason: "Customer requested",
      idempotencyKey: "test-idem-key-1",
    };

    const refund1 = await createRefund(input);
    expect(refund1).toBeDefined();
    expect(refund1.id).toBeDefined();
    expect(refund1.amount).toBe("100.00");
    expect(refund1.idempotency_key).toBe("test-idem-key-1");

    // Second call with same idempotency key should return same refund
    const refund2 = await createRefund(input);
    expect(refund2.id).toBe(refund1.id);
  });

  test("should require approval for high-value refunds", async () => {
    const input = {
      paymentId: "test-payment-456",
      originModule: "wallet",
      initiator: "customer" as const,
      type: "refund" as const,
      amount: 15000.0, // Above threshold
      currency: "USD",
      idempotencyKey: "test-idem-key-2",
    };

    const refund = await createRefund(input);
    expect(refund.status).toBe("requires_approval");
  });
});
