// ============================================================================
// Ops Handlers Unit Tests
// ============================================================================

import request from "supertest";
import { app } from "../server";
import { pool } from "../db";

jest.mock("../db");
jest.mock("../sira/client");

const mockPool = pool as jest.Mocked<typeof pool>;

const mockToken =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsInJvbGVzIjpbInBheV9hZG1pbiJdLCJpc3MiOiJtb2xhbS1pZCIsImlhdCI6MTYxNjIzOTAyMn0.test";

// Mock JWT verification
jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(() => ({
    sub: "user-123",
    roles: ["pay_admin"],
    iss: "molam-id",
  })),
}));

describe("Ops Control Handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Freeze Payouts
  // ============================================================================

  describe("POST /api/ops/freeze-payouts", () => {
    it("should freeze payouts globally", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any) // Idempotency check
        .mockResolvedValueOnce({ rows: [] } as any) // Insert action log
        .mockResolvedValueOnce({ rows: [] } as any) // Insert treasury control
        .mockResolvedValueOnce({
          rows: [
            {
              id: "log-123",
              action_type: "freeze_payouts",
              status: "accepted",
            },
          ],
        } as any); // Select log

      const response = await request(app)
        .post("/api/ops/freeze-payouts")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "freeze-test-123")
        .send({
          scope: "global",
          reason: "Emergency maintenance",
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.log.action_type).toBe("freeze_payouts");
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });

    it("should freeze payouts for specific bank", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({
          rows: [{ id: "log-123", action_type: "freeze_payouts" }],
        } as any);

      const response = await request(app)
        .post("/api/ops/freeze-payouts")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "freeze-test-456")
        .send({
          scope: "bank-profile-uuid",
          reason: "Bank outage",
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it("should return existing log for duplicate idempotency key", async () => {
      const existingLog = {
        id: "log-existing",
        action_type: "freeze_payouts",
        status: "accepted",
      };

      mockPool.query.mockResolvedValueOnce({ rows: [existingLog] } as any);

      const response = await request(app)
        .post("/api/ops/freeze-payouts")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "freeze-duplicate")
        .send({
          scope: "global",
          reason: "Test",
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.log.id).toBe("log-existing");
      expect(mockPool.query).toHaveBeenCalledTimes(1); // Only idempotency check
    });

    it("should return 400 if idempotency key missing", async () => {
      const response = await request(app)
        .post("/api/ops/freeze-payouts")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          scope: "global",
          reason: "Test",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("idempotency_key_required");
    });

    it("should return 400 if scope or reason missing", async () => {
      const response = await request(app)
        .post("/api/ops/freeze-payouts")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "freeze-test")
        .send({
          scope: "global",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("scope_and_reason_required");
    });
  });

  // ============================================================================
  // Generate Plan
  // ============================================================================

  describe("POST /api/ops/generate-plan", () => {
    it("should generate routing optimization plan", async () => {
      const { generatePlan } = require("../sira/client");
      generatePlan.mockResolvedValueOnce({
        summary: "Optimize routing for 1,234 pending payouts",
        steps: [
          {
            action: "reroute_payouts",
            from_bank: "bank-a",
            to_bank: "bank-b",
            count: 567,
            estimated_savings: 234.5,
          },
        ],
        total_amount: 1234567.89,
        approval_required: true,
      });

      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any) // Idempotency check
        .mockResolvedValueOnce({ rows: [] } as any) // Insert plan
        .mockResolvedValueOnce({ rows: [] } as any) // Insert action log
        .mockResolvedValueOnce({
          rows: [{ id: "log-123", action_type: "generate_plan" }],
        } as any); // Select log

      const response = await request(app)
        .post("/api/ops/generate-plan")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "plan-test-123")
        .send({
          plan_params: {
            type: "routing_optimization",
            timeframe: "24h",
            constraints: {
              max_cost: 10000,
              min_success_rate: 0.99,
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.plan.summary).toContain("1,234 pending payouts");
      expect(response.body.plan.approval_required).toBe(true);
    });

    it("should return 400 if plan_params missing", async () => {
      const response = await request(app)
        .post("/api/ops/generate-plan")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "plan-test")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("plan_params_required");
    });
  });

  // ============================================================================
  // Execute Plan
  // ============================================================================

  describe("POST /api/ops/execute-plan", () => {
    it("should execute approved plan", async () => {
      const plan = {
        id: "plan-123",
        plan_type: "routing_optimization",
        approval_required: false,
        status: "pending",
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any) // Idempotency check
        .mockResolvedValueOnce({ rows: [plan] } as any) // Get plan
        .mockResolvedValueOnce({ rows: [] } as any) // Update plan status
        .mockResolvedValueOnce({ rows: [] } as any) // Insert action log
        .mockResolvedValueOnce({
          rows: [{ id: "log-123", action_type: "execute_plan" }],
        } as any); // Select log

      const response = await request(app)
        .post("/api/ops/execute-plan")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "execute-test-123")
        .send({
          plan_id: "plan-123",
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it("should return 404 if plan not found", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any) // Idempotency check
        .mockResolvedValueOnce({ rows: [] } as any); // Get plan (not found)

      const response = await request(app)
        .post("/api/ops/execute-plan")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "execute-test")
        .send({
          plan_id: "nonexistent",
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("plan_not_found");
    });
  });

  // ============================================================================
  // Retry Payout
  // ============================================================================

  describe("POST /api/ops/retry-payout", () => {
    it("should retry payout", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any) // Idempotency check
        .mockResolvedValueOnce({ rows: [] } as any) // Insert action log
        .mockResolvedValueOnce({
          rows: [{ id: "log-123", action_type: "retry_payout" }],
        } as any); // Select log

      const response = await request(app)
        .post("/api/ops/retry-payout")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "retry-test-123")
        .send({
          payout_id: "payout-123",
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it("should return 400 if payout_id missing", async () => {
      const response = await request(app)
        .post("/api/ops/retry-payout")
        .set("Authorization", `Bearer ${mockToken}`)
        .set("Idempotency-Key", "retry-test")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("payout_id_required");
    });
  });

  // ============================================================================
  // Get Actions (Audit Query)
  // ============================================================================

  describe("GET /api/ops/actions", () => {
    it("should return ops actions with filters", async () => {
      const actions = [
        {
          id: "log-1",
          action_type: "freeze_payouts",
          status: "accepted",
          created_at: new Date().toISOString(),
        },
        {
          id: "log-2",
          action_type: "retry_payout",
          status: "executed",
          created_at: new Date().toISOString(),
        },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: actions } as any);

      const response = await request(app)
        .get("/api/ops/actions")
        .set("Authorization", `Bearer ${mockToken}`)
        .query({ action_type: "freeze_payouts", limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.actions).toHaveLength(2);
    });
  });

  // ============================================================================
  // Get Controls
  // ============================================================================

  describe("GET /api/ops/controls", () => {
    it("should return active treasury controls", async () => {
      const controls = [
        {
          key: "freeze_global",
          value: { reason: "Emergency" },
          enabled: true,
        },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: controls } as any);

      const response = await request(app)
        .get("/api/ops/controls")
        .set("Authorization", `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.controls).toHaveLength(1);
      expect(response.body.controls[0].key).toBe("freeze_global");
    });
  });
});
