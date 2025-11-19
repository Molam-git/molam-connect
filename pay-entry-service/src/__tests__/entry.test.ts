// ============================================================================
// Pay Entry API Tests
// ============================================================================

import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { entryRouter } from "../routes/entry";

// Mock dependencies
jest.mock("../services/preferenceService");
jest.mock("../sira/hook");

import * as preferenceService from "../services/preferenceService";
import * as siraHook from "../sira/hook";

// Test app setup
const app = express();
app.use(express.json());

// Mock JWT middleware - inject test user
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.user = {
    sub: "test-user-123",
    roles: ["user"],
    country: "SN",
    currency: "XOF",
    lang: "fr",
    agent_id: null,
  };
  next();
});

app.use("/api/pay/entry", entryRouter);

describe("GET /api/pay/entry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return default preferences when none exist", async () => {
    // Mock getPreferences to return null
    (preferenceService.getPreferences as jest.Mock).mockResolvedValue(null);
    (siraHook.publishSiraEvent as jest.Mock).mockResolvedValue(null);

    const response = await request(app).get("/api/pay/entry");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("user_id", "test-user-123");
    expect(response.body).toHaveProperty("preferred_module", "wallet");
    expect(response.body).toHaveProperty("modules_enabled");
    expect(response.body.modules_enabled).toContain("wallet");
    expect(response.body).toHaveProperty("auto_redirect", false);
  });

  it("should return existing preferences", async () => {
    const mockPrefs = {
      user_id: "test-user-123",
      preferred_module: "connect",
      last_module_used: "connect",
      modules_enabled: ["wallet", "connect"],
      auto_redirect: true,
      country: "SN",
      currency: "XOF",
      lang: "fr",
    };

    (preferenceService.getPreferences as jest.Mock).mockResolvedValue(mockPrefs);
    (siraHook.publishSiraEvent as jest.Mock).mockResolvedValue(null);

    const response = await request(app).get("/api/pay/entry");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockPrefs);
  });

  it("should apply SIRA recommendation when auto_redirect is enabled", async () => {
    const mockPrefs = {
      user_id: "test-user-123",
      preferred_module: "wallet",
      last_module_used: "wallet",
      modules_enabled: ["wallet", "connect"],
      auto_redirect: true,
      country: "SN",
      currency: "XOF",
      lang: "fr",
    };

    const siraHint = {
      preferred_module: "connect",
      confidence_score: 0.9,
      reason: "high_usage_pattern",
    };

    (preferenceService.getPreferences as jest.Mock).mockResolvedValue(mockPrefs);
    (siraHook.publishSiraEvent as jest.Mock).mockResolvedValue(siraHint);

    const response = await request(app).get("/api/pay/entry");

    expect(response.status).toBe(200);
    expect(response.body.preferred_module).toBe("connect");
  });

  it("should handle SIRA failure gracefully", async () => {
    const mockPrefs = {
      user_id: "test-user-123",
      preferred_module: "wallet",
      last_module_used: "wallet",
      modules_enabled: ["wallet"],
      auto_redirect: true,
      country: "SN",
      currency: "XOF",
      lang: "fr",
    };

    (preferenceService.getPreferences as jest.Mock).mockResolvedValue(mockPrefs);
    (siraHook.publishSiraEvent as jest.Mock).mockRejectedValue(new Error("SIRA timeout"));

    const response = await request(app).get("/api/pay/entry");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockPrefs);
  });
});

describe("POST /api/pay/entry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should update preferences successfully", async () => {
    const updatePayload = {
      preferred_module: "connect",
      modules_enabled: ["wallet", "connect"],
      auto_redirect: true,
    };

    const mockUpdated = {
      user_id: "test-user-123",
      ...updatePayload,
      last_module_used: null,
      country: "SN",
      currency: "XOF",
      lang: "fr",
    };

    (preferenceService.upsertPreferences as jest.Mock).mockResolvedValue(mockUpdated);
    (siraHook.publishSiraEvent as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post("/api/pay/entry")
      .send(updatePayload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockUpdated);
    expect(preferenceService.upsertPreferences).toHaveBeenCalledWith(
      "test-user-123",
      expect.objectContaining({
        preferred_module: "connect",
        modules_enabled: ["wallet", "connect"],
        auto_redirect: true,
      })
    );
  });

  it("should reject invalid modules_enabled type", async () => {
    const response = await request(app)
      .post("/api/pay/entry")
      .send({ modules_enabled: "invalid" });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error", "modules_enabled_must_be_array");
  });

  it("should reject invalid preferred_module type", async () => {
    const response = await request(app)
      .post("/api/pay/entry")
      .send({ preferred_module: 123 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      "error",
      "preferred_module_must_be_string_or_null"
    );
  });
});
