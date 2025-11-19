// ============================================================================
// SIRA Integration Client
// ============================================================================

import axios from "axios";
import { logger } from "../logger";

const SIRA_URL = process.env.SIRA_URL || "";
const SIRA_TIMEOUT = 5000; // 5 seconds

export interface PlanParams {
  type: "routing_optimization" | "float_rebalance" | "risk_mitigation";
  timeframe?: string;
  constraints?: {
    max_cost?: number;
    min_success_rate?: number;
    [key: string]: any;
  };
}

export interface PlanStep {
  action: string;
  from_bank?: string;
  to_bank?: string;
  count?: number;
  estimated_savings?: number;
  [key: string]: any;
}

export interface SiraPlan {
  summary: string;
  steps: PlanStep[];
  total_amount: number;
  approval_required: boolean;
  confidence?: number;
}

export async function generatePlan(
  params: PlanParams
): Promise<SiraPlan | null> {
  if (!SIRA_URL) {
    logger.warn("SIRA_URL not configured, using fallback plan");
    return generateFallbackPlan(params);
  }

  try {
    logger.info("Requesting plan from SIRA", { params });

    const response = await axios.post(
      `${SIRA_URL}/api/plan`,
      { plan_params: params },
      {
        timeout: SIRA_TIMEOUT,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    logger.info("SIRA plan generated successfully", {
      plan_type: params.type,
    });

    return response.data.plan;
  } catch (error: any) {
    logger.error("SIRA plan generation failed", {
      error: error.message,
      plan_type: params.type,
    });

    // Fallback to local heuristics
    return generateFallbackPlan(params);
  }
}

function generateFallbackPlan(params: PlanParams): SiraPlan {
  logger.info("Using fallback plan generation", { type: params.type });

  if (params.type === "routing_optimization") {
    return {
      summary: "Local heuristic: Use lowest-cost bank connector",
      steps: [
        {
          action: "reroute_payouts",
          from_bank: "expensive-bank",
          to_bank: "cheap-bank",
          count: 0,
          estimated_savings: 0,
        },
      ],
      total_amount: 0,
      approval_required: false,
      confidence: 0.5,
    };
  }

  if (params.type === "float_rebalance") {
    return {
      summary: "Local heuristic: Balance funds across accounts",
      steps: [
        {
          action: "transfer_float",
          from_bank: "high-balance-bank",
          to_bank: "low-balance-bank",
          count: 0,
        },
      ],
      total_amount: 0,
      approval_required: true,
      confidence: 0.5,
    };
  }

  if (params.type === "risk_mitigation") {
    return {
      summary: "Local heuristic: Pause risky connectors",
      steps: [
        {
          action: "pause_bank",
          bank_id: "risky-bank",
        },
      ],
      total_amount: 0,
      approval_required: true,
      confidence: 0.5,
    };
  }

  return {
    summary: "No plan available",
    steps: [],
    total_amount: 0,
    approval_required: false,
    confidence: 0,
  };
}
