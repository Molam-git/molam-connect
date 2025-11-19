// ============================================================================
// Generate Plan Panel - Web (React)
// ============================================================================

import React, { useState } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

interface GeneratePlanPanelProps {
  planType: "routing_optimization" | "float_rebalance" | "risk_mitigation";
  onPlanGenerated?: (plan: any) => void;
  apiUrl?: string;
  token: string;
}

interface PlanStep {
  action: string;
  from_bank?: string;
  to_bank?: string;
  count?: number;
  estimated_savings?: number;
  [key: string]: any;
}

interface Plan {
  id: string;
  summary: string;
  steps: PlanStep[];
  total_amount: number;
  approval_required: boolean;
  confidence?: number;
}

export const GeneratePlanPanel: React.FC<GeneratePlanPanelProps> = ({
  planType,
  onPlanGenerated,
  apiUrl = "https://api.molam.com",
  token,
}) => {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [timeframe, setTimeframe] = useState("24h");
  const [maxCost, setMaxCost] = useState("10000");
  const [minSuccessRate, setMinSuccessRate] = useState("0.99");

  const handleGeneratePlan = async () => {
    setLoading(true);
    setError("");
    setPlan(null);

    try {
      const idempotencyKey = `plan-${Date.now()}-${uuidv4()}`;

      const response = await axios.post(
        `${apiUrl}/api/ops/generate-plan`,
        {
          plan_params: {
            type: planType,
            timeframe,
            constraints: {
              max_cost: parseFloat(maxCost),
              min_success_rate: parseFloat(minSuccessRate),
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": idempotencyKey,
            "Content-Type": "application/json",
          },
        }
      );

      setPlan(response.data.plan);
      onPlanGenerated?.(response.data.plan);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  };

  const handleExecutePlan = async () => {
    if (!plan) return;

    setLoading(true);
    setError("");

    try {
      const idempotencyKey = `execute-${Date.now()}-${uuidv4()}`;

      await axios.post(
        `${apiUrl}/api/ops/execute-plan`,
        {
          plan_id: plan.id,
          approval_token: plan.approval_required ? "multi-sig-token" : undefined,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": idempotencyKey,
            "Content-Type": "application/json",
          },
        }
      );

      alert("Plan executed successfully!");
      setPlan(null);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to execute plan");
    } finally {
      setLoading(false);
    }
  };

  const getPlanTypeLabel = () => {
    switch (planType) {
      case "routing_optimization":
        return "Routing Optimization";
      case "float_rebalance":
        return "Float Rebalance";
      case "risk_mitigation":
        return "Risk Mitigation";
      default:
        return planType;
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Generate {getPlanTypeLabel()} Plan</h3>

      {!plan && (
        <div style={styles.form}>
          <label style={styles.label}>
            Timeframe
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              style={styles.select}
            >
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
          </label>

          <label style={styles.label}>
            Max Cost ($)
            <input
              type="number"
              value={maxCost}
              onChange={(e) => setMaxCost(e.target.value)}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Min Success Rate
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={minSuccessRate}
              onChange={(e) => setMinSuccessRate(e.target.value)}
              style={styles.input}
            />
          </label>

          <button
            onClick={handleGeneratePlan}
            disabled={loading}
            style={{
              ...styles.generateButton,
              ...(loading ? styles.buttonDisabled : {}),
            }}
          >
            {loading ? "Generating..." : "✨ Generate Plan"}
          </button>
        </div>
      )}

      {loading && !plan && (
        <div style={styles.progress}>
          <div style={styles.progressBar}></div>
          <p style={styles.progressText}>Generating plan with SIRA...</p>
        </div>
      )}

      {plan && (
        <div style={styles.planPreview}>
          <div style={styles.planHeader}>
            <h4 style={styles.planTitle}>Plan Preview</h4>
            {plan.confidence && (
              <span style={styles.confidence}>
                Confidence: {Math.round(plan.confidence * 100)}%
              </span>
            )}
          </div>

          <p style={styles.summary}>{plan.summary}</p>

          <div style={styles.steps}>
            <h5 style={styles.stepsTitle}>Steps:</h5>
            {plan.steps.map((step, index) => (
              <div key={index} style={styles.step}>
                <div style={styles.stepNumber}>{index + 1}</div>
                <div style={styles.stepContent}>
                  <div style={styles.stepAction}>{step.action}</div>
                  {step.from_bank && (
                    <div style={styles.stepDetail}>
                      From: {step.from_bank} → To: {step.to_bank}
                    </div>
                  )}
                  {step.count && (
                    <div style={styles.stepDetail}>{step.count} payouts</div>
                  )}
                  {step.estimated_savings && (
                    <div style={styles.stepSavings}>
                      Savings: ${step.estimated_savings.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={styles.planFooter}>
            <div style={styles.planMeta}>
              <span style={styles.metaLabel}>Total Amount:</span>
              <span style={styles.metaValue}>
                ${plan.total_amount.toLocaleString()}
              </span>
            </div>
            {plan.approval_required && (
              <div style={styles.approvalBadge}>Multi-Sig Required</div>
            )}
          </div>

          <div style={styles.planActions}>
            <button
              onClick={handleExecutePlan}
              disabled={loading}
              style={{
                ...styles.executeButton,
                ...(loading ? styles.buttonDisabled : {}),
              }}
            >
              {loading ? "Executing..." : "Execute Plan"}
            </button>
            <button
              onClick={() => setPlan(null)}
              disabled={loading}
              style={styles.cancelButton}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    maxWidth: "600px",
  },
  title: {
    margin: "0 0 20px 0",
    fontSize: "20px",
    fontWeight: 700,
    color: "#1f2937",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    display: "block",
    width: "100%",
    marginTop: "8px",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    outline: "none",
  },
  select: {
    display: "block",
    width: "100%",
    marginTop: "8px",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    outline: "none",
    backgroundColor: "#fff",
  },
  generateButton: {
    marginTop: "8px",
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: 600,
    color: "#fff",
    backgroundColor: "#8b5cf6",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  progress: {
    padding: "20px 0",
    textAlign: "center",
  },
  progressBar: {
    width: "100%",
    height: "8px",
    backgroundColor: "#e5e7eb",
    borderRadius: "4px",
    overflow: "hidden",
    marginBottom: "12px",
  },
  progressText: {
    fontSize: "14px",
    color: "#6b7280",
  },
  planPreview: {
    marginTop: "16px",
  },
  planHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  planTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 700,
    color: "#1f2937",
  },
  confidence: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#10b981",
  },
  summary: {
    fontSize: "14px",
    color: "#6b7280",
    marginBottom: "16px",
  },
  steps: {
    marginBottom: "16px",
  },
  stepsTitle: {
    margin: "0 0 12px 0",
    fontSize: "14px",
    fontWeight: 700,
    color: "#374151",
  },
  step: {
    display: "flex",
    gap: "12px",
    marginBottom: "12px",
    padding: "12px",
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
  },
  stepNumber: {
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8b5cf6",
    color: "#fff",
    borderRadius: "50%",
    fontSize: "14px",
    fontWeight: 700,
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
  },
  stepAction: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#1f2937",
    marginBottom: "4px",
  },
  stepDetail: {
    fontSize: "13px",
    color: "#6b7280",
    marginBottom: "2px",
  },
  stepSavings: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#10b981",
  },
  planFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderTop: "1px solid #e5e7eb",
    marginBottom: "16px",
  },
  planMeta: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  metaLabel: {
    fontSize: "14px",
    fontWeight: 500,
    color: "#6b7280",
  },
  metaValue: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#1f2937",
  },
  approvalBadge: {
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#f59e0b",
    backgroundColor: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: "12px",
  },
  planActions: {
    display: "flex",
    gap: "12px",
  },
  executeButton: {
    flex: 1,
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: 600,
    color: "#fff",
    backgroundColor: "#10b981",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  cancelButton: {
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: 600,
    color: "#374151",
    backgroundColor: "#f3f4f6",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  error: {
    marginTop: "16px",
    padding: "12px",
    fontSize: "14px",
    color: "#dc2626",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
  },
};
