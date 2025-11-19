// ============================================================================
// Approval Engine Tests
// ============================================================================

import request from "supertest";
import { app } from "../server";
import { pool } from "../db";
import { evaluateQuorum } from "../services/quorumEvaluator";

jest.mock("../db");
jest.mock("axios");

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

describe("Approval Engine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Create Approval Request
  // ==========================================================================

  describe("POST /api/approvals/requests", () => {
    it("should create approval request", async () => {
      const policyId = "policy-123";
      const opsLogId = "ops-log-123";

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: policyId, ttl_hours: 72, required_roles: ["pay_admin", "finance_ops"] }],
        } as any) // Get policy
        .mockResolvedValueOnce({ rows: [] } as any) // Insert request
        .mockResolvedValueOnce({ rows: [] } as any) // Insert audit
        .mockResolvedValueOnce({
          rows: [
            {
              id: "request-123",
              ops_log_id: opsLogId,
              policy_id: policyId,
              status: "pending",
            },
          ],
        } as any); // Select created

      const response = await request(app)
        .post("/api/approvals/requests")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          ops_log_id: opsLogId,
          policy_id: policyId,
          payload: { action: "execute_plan", amount: 50000 },
          target: { plan_id: "plan-123" },
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("pending");
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });

    it("should return 400 if required fields missing", async () => {
      const response = await request(app)
        .post("/api/approvals/requests")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          ops_log_id: "ops-123",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("required");
    });
  });

  // ==========================================================================
  // Submit Vote
  // ==========================================================================

  describe("POST /api/approvals/requests/:id/vote", () => {
    it("should submit vote", async () => {
      const requestId = "request-123";

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ status: "pending" }],
        } as any) // Check request status
        .mockResolvedValueOnce({ rows: [] } as any) // Insert vote
        .mockResolvedValueOnce({ rows: [] } as any); // Insert audit

      const response = await request(app)
        .post(`/api/approvals/requests/${requestId}/vote`)
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          vote: "approve",
          comment: "Looks good",
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it("should reject invalid vote", async () => {
      const response = await request(app)
        .post("/api/approvals/requests/request-123/vote")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          vote: "invalid",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("invalid_vote");
    });

    it("should reject vote on non-pending request", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ status: "approved" }],
      } as any);

      const response = await request(app)
        .post("/api/approvals/requests/request-123/vote")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          vote: "approve",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("request_not_pending");
    });
  });

  // ==========================================================================
  // Quorum Evaluation
  // ==========================================================================

  describe("Quorum evaluation", () => {
    it("should approve when quorum met", async () => {
      const requestId = "request-123";

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: requestId,
              status: "pending",
              ops_log_id: "ops-123",
              quorum: 2,
              veto_roles: [],
            },
          ],
        } as any) // Get request
        .mockResolvedValueOnce({
          rows: [
            { vote: "approve", approver_id: "user-1", approver_role: "pay_admin" },
            { vote: "approve", approver_id: "user-2", approver_role: "finance_ops" },
          ],
        } as any) // Get votes
        .mockResolvedValueOnce({ rows: [] } as any) // Update request status
        .mockResolvedValueOnce({ rows: [] } as any) // Insert audit
        .mockResolvedValueOnce({ rows: [] } as any); // Update ops log

      await evaluateQuorum(requestId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE approval_requests SET status = 'approved'"),
        [requestId]
      );
    });

    it("should reject on veto", async () => {
      const requestId = "request-123";

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: requestId,
              status: "pending",
              ops_log_id: "ops-123",
              quorum: 2,
              veto_roles: ["compliance"],
            },
          ],
        } as any) // Get request
        .mockResolvedValueOnce({
          rows: [
            { vote: "reject", approver_id: "user-1", approver_role: "compliance" },
          ],
        } as any) // Get votes (veto)
        .mockResolvedValueOnce({ rows: [] } as any) // Update request status
        .mockResolvedValueOnce({ rows: [] } as any) // Insert audit
        .mockResolvedValueOnce({ rows: [] } as any); // Update ops log

      await evaluateQuorum(requestId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE approval_requests SET status = 'rejected'"),
        [requestId]
      );
    });

    it("should set partially_approved when quorum not met", async () => {
      const requestId = "request-123";

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: requestId,
              status: "pending",
              ops_log_id: "ops-123",
              quorum: 3,
              veto_roles: [],
            },
          ],
        } as any) // Get request
        .mockResolvedValueOnce({
          rows: [
            { vote: "approve", approver_id: "user-1", approver_role: "pay_admin" },
          ],
        } as any) // Get votes (only 1)
        .mockResolvedValueOnce({ rows: [] } as any); // Update to partially_approved

      await evaluateQuorum(requestId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE approval_requests SET status = 'partially_approved'"),
        [requestId]
      );
    });
  });

  // ==========================================================================
  // List Requests
  // ==========================================================================

  describe("GET /api/approvals/requests", () => {
    it("should list pending requests", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: "req-1", status: "pending", policy_name: "Execute Plan" },
          { id: "req-2", status: "pending", policy_name: "Add Bank" },
        ],
      } as any);

      const response = await request(app)
        .get("/api/approvals/requests?status=pending")
        .set("Authorization", `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.requests).toHaveLength(2);
    });
  });
});
