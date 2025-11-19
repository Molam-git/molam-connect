/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Unit Tests: Incident Processor
 */

import { processIncidentMessage } from "../src/workers/incident-processor";
import { pool } from "../src/db";

// Mock dependencies
jest.mock("../src/sira/decider");
jest.mock("../src/ops/policy");
jest.mock("../src/workers/patch-utils");
jest.mock("../src/webhooks/publisher");

describe("Incident Processor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("autopatch path success", async () => {
    // Mock SIRA decision
    const mockDecideWithSira = require("../src/sira/decider").decideWithSira;
    mockDecideWithSira.mockResolvedValue({
      action: "patch",
      patch_version: "1.2.3",
      current_version: "1.2.0",
      confidence: 0.87,
      explanation: "High webhook failure rate, patch fixes known issue"
    });

    // Mock Ops policy
    const mockGetOpsPolicy = require("../src/ops/policy").getOpsPolicy;
    mockGetOpsPolicy.mockResolvedValue({
      autopatch_enabled: true,
      autopatch_whitelist: [],
      autopatch_max_severity: "medium",
      require_staging_test: true,
      sira_min_confidence: 0.75
    });

    // Mock staging tests
    const mockRunSmokeTestsOnStaging = require("../src/workers/patch-utils").runSmokeTestsOnStaging;
    mockRunSmokeTestsOnStaging.mockResolvedValue(true);

    // Mock apply patch
    const mockApplyPatchToMerchantPlugin = require("../src/workers/patch-utils").applyPatchToMerchantPlugin;
    mockApplyPatchToMerchantPlugin.mockResolvedValue({ ok: true, logs: [] });

    // Mock plugin data
    const mockQuery = jest.fn();
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "plugin-123",
          merchant_id: "merchant-123",
          plugin_version: "1.2.0",
          last_heartbeat: new Date()
        }]
      })
      .mockResolvedValueOnce({ rows: [] }) // No existing incidents
      .mockResolvedValueOnce({ rows: [{ id: "incident-123" }] }); // Create incident

    (pool.query as jest.Mock) = mockQuery;

    // Process incident
    await processIncidentMessage({
      pluginId: "plugin-123",
      merchantId: "merchant-123",
      telemetry: {
        errors_last_24h: 50,
        webhook_fail_rate: 0.6,
        timestamp: new Date().toISOString()
      }
    });

    // Assertions
    expect(mockDecideWithSira).toHaveBeenCalled();
    expect(mockRunSmokeTestsOnStaging).toHaveBeenCalled();
    expect(mockApplyPatchToMerchantPlugin).toHaveBeenCalled();
  });

  test("staging failure => create attempt fail", async () => {
    const mockDecideWithSira = require("../src/sira/decider").decideWithSira;
    mockDecideWithSira.mockResolvedValue({
      action: "patch",
      patch_version: "1.2.3",
      confidence: 0.87
    });

    const mockGetOpsPolicy = require("../src/ops/policy").getOpsPolicy;
    mockGetOpsPolicy.mockResolvedValue({
      autopatch_enabled: true,
      autopatch_whitelist: [],
      autopatch_max_severity: "medium"
    });

    const mockRunSmokeTestsOnStaging = require("../src/workers/patch-utils").runSmokeTestsOnStaging;
    mockRunSmokeTestsOnStaging.mockResolvedValue(false); // Staging failed

    const mockQuery = jest.fn();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "plugin-123", merchant_id: "merchant-123", plugin_version: "1.2.0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "incident-123" }] });

    (pool.query as jest.Mock) = mockQuery;

    await processIncidentMessage({
      pluginId: "plugin-123",
      merchantId: "merchant-123",
      telemetry: { errors_last_24h: 50, webhook_fail_rate: 0.6 }
    });

    // Should not call applyPatch
    const mockApplyPatch = require("../src/workers/patch-utils").applyPatchToMerchantPlugin;
    expect(mockApplyPatch).not.toHaveBeenCalled();
  });
});



