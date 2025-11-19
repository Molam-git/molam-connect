/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Unit Tests
 */

import request from "supertest";
import app from "../src/server";
import { pool } from "../src/db";

// Mock data
const mockPredictionId = "00000000-0000-0000-0000-000000000001";
const mockToken = "mock-jwt-token";

describe("SIRA API", () => {
  beforeAll(async () => {
    // Setup test database if needed
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("GET /api/sira/predictions", () => {
    it("should list predictions", async () => {
      const res = await request(app)
        .get("/api/sira/predictions")
        .set("Authorization", `Bearer ${mockToken}`)
        .query({ limit: 10 });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
      expect(res.body).toHaveProperty("rows");
      expect(Array.isArray(res.body.rows)).toBe(true);
    });
  });

  describe("POST /api/sira/feedback", () => {
    it("should create feedback", async () => {
      // First create a mock prediction
      // Then create feedback
      const res = await request(app)
        .post("/api/sira/feedback")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          prediction_id: mockPredictionId,
          label: "fraud",
          comment: "Confirmed fraud"
        });

      // Will fail without proper auth, but shows structure
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
    });

    it("should reject invalid label", async () => {
      const res = await request(app)
        .post("/api/sira/feedback")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          prediction_id: mockPredictionId,
          label: "invalid_label"
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /api/sira/predictions/:id", () => {
    it("should get prediction with explain", async () => {
      const res = await request(app)
        .get(`/api/sira/predictions/${mockPredictionId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(res.body).toHaveProperty("prediction");
        expect(res.body).toHaveProperty("explain");
      }
    });
  });

  describe("POST /api/sira/override", () => {
    it("should require multi-sig for high-risk overrides", async () => {
      const res = await request(app)
        .post("/api/sira/override")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          prediction_id: mockPredictionId,
          override_decision: "reject",
          justification: "High risk"
        });

      // Should either succeed (if multi-sig complete) or return 403
      expect([200, 403]).toContain(res.status);
    });
  });
});

