/**
 * Brique 50 - Fiscal Reporting
 * SIRA Integration for Predict Rejection
 */

import dotenv from "dotenv";

dotenv.config();

const SIRA_API_URL = process.env.SIRA_API_URL || "http://localhost:8044";
const SIRA_ENABLED = process.env.SIRA_ENABLED === "true";

interface RejectPrediction {
  probability: number; // 0-1 (will be converted to 0-100 for storage)
  confidence: number;
  factors: string[];
  recommendation: string;
}

/**
 * Predict rejection probability using SIRA ML model
 */
export async function predictReject(report: any): Promise<RejectPrediction> {
  if (!SIRA_ENABLED) {
    // Return mock prediction for development
    return {
      probability: 0.15,
      confidence: 0.75,
      factors: ["data_completeness", "format_compliance"],
      recommendation: "Report appears valid, proceed with submission",
    };
  }

  try {
    const response = await fetch(`${SIRA_API_URL}/api/sira/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "fiscal_report_rejection",
        features: {
          report_type: report.report_type,
          country: report.country,
          period_days: getDaysBetween(report.period_start, report.period_end),
          item_count: report.canonical_json?.items?.length || 0,
          legal_entity: report.legal_entity,
        },
      }),
    });

    if (!response.ok) {
      console.error("SIRA prediction failed:", response.statusText);
      return getDefaultPrediction();
    }

    const data: any = await response.json();

    return {
      probability: data.score / 100, // Convert 0-100 to 0-1
      confidence: data.confidence || 0.5,
      factors: data.factors || [],
      recommendation: data.recommendation || "Review recommended",
    };
  } catch (err) {
    console.error("SIRA prediction error:", err);
    return getDefaultPrediction();
  }
}

function getDefaultPrediction(): RejectPrediction {
  return {
    probability: 0.25,
    confidence: 0.5,
    factors: ["unknown"],
    recommendation: "Manual review recommended",
  };
}

function getDaysBetween(start: string | Date, end: string | Date): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
