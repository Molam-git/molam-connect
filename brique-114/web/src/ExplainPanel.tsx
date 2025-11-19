/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Explain Panel - Shows prediction details, SHAP explainability, feedback form
 */

import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import EvidenceUploader from "./EvidenceUploader";

interface Prediction {
  id: string;
  event_id: string;
  model_id: string;
  score: number;
  decision: string;
  features: any;
  created_at: string;
}

interface Explain {
  summary: Array<{
    feature: string;
    contribution: number;
    direction: "positive" | "negative";
  }>;
  top_features: number;
  model_version: string;
  partial?: boolean;
}

interface Feedback {
  id: string;
  label: string;
  comment: string;
  created_at: string;
  reviewer_role: string;
}

interface Props {
  predictionId: string;
  onClose: () => void;
}

export default function ExplainPanel({ predictionId, onClose }: Props) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [explain, setExplain] = useState<Explain | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [overrideDecision, setOverrideDecision] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPrediction();
  }, [predictionId]);

  async function loadPrediction() {
    try {
      setLoading(true);
      const res = await fetch(`/api/sira/predictions/${predictionId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      setPrediction(data.prediction);
      setExplain(data.explain);
      setFeedback(data.feedback || []);
    } catch (error) {
      console.error("Failed to load prediction:", error);
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback() {
    if (!label) {
      alert("Please select a label");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/sira/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          prediction_id: predictionId,
          label,
          comment: comment || null,
          override_decision: overrideDecision || null
        })
      });

      if (!res.ok) {
        const error = await res.json();
        if (error.error === "multisig_required") {
          alert("Multi-signature approval required for this override");
          return;
        }
        throw new Error(error.message || "Failed to submit feedback");
      }

      alert("Feedback submitted successfully");
      setLabel("");
      setComment("");
      setOverrideDecision("");
      await loadPrediction();
    } catch (error: any) {
      console.error("Failed to submit feedback:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-8 text-center">
        <div className="text-gray-500">Chargement...</div>
      </div>
    );
  }

  if (!prediction || !explain) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-8 text-center">
        <div className="text-red-500">Prediction not found</div>
      </div>
    );
  }

  // Prepare chart data
  const chartData = explain.summary
    .slice(0, 10)
    .map((item) => ({
      feature: item.feature,
      contribution: item.contribution,
      direction: item.direction
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return (
    <div className="bg-white rounded-lg border shadow-sm">
      {/* Header */}
      <div className="p-4 border-b flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">{prediction.event_id}</h2>
          <div className="text-sm text-gray-600 mt-1">
            Score: {(prediction.score * 100).toFixed(1)}% • Decision: {prediction.decision}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
        {/* Explainability Chart */}
        <div>
          <h3 className="font-semibold mb-3">Top Features Contribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis
                dataKey="feature"
                angle={-45}
                textAnchor="end"
                height={100}
                interval={0}
              />
              <YAxis />
              <Tooltip />
              <Bar
                dataKey="contribution"
                fill={(entry: any) => (entry.direction === "positive" ? "#3b82f6" : "#ef4444")}
              />
            </BarChart>
          </ResponsiveContainer>
          {explain.partial && (
            <div className="text-xs text-yellow-600 mt-2">
              ⚠️ Partial explanation (explainer service unavailable)
            </div>
          )}
        </div>

        {/* Feedback Form */}
        <div className="border-t pt-4">
          <h3 className="font-semibold mb-3">Add Feedback</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Label</label>
              <select
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="">Select label...</option>
                <option value="fraud">Fraud</option>
                <option value="ok">OK</option>
                <option value="needs_review">Needs Review</option>
                <option value="false_positive">False Positive</option>
                <option value="false_negative">False Negative</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                rows={3}
                placeholder="Add notes..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Override Decision (optional)</label>
              <select
                value={overrideDecision}
                onChange={(e) => setOverrideDecision(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="">No override</option>
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
                <option value="review">Review</option>
                <option value="block">Block</option>
              </select>
            </div>

            <EvidenceUploader predictionId={predictionId} />

            <button
              onClick={submitFeedback}
              disabled={!label || submitting}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        </div>

        {/* Feedback History */}
        {feedback.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Feedback History</h3>
            <div className="space-y-2">
              {feedback.map((f) => (
                <div key={f.id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{f.label}</div>
                      {f.comment && <div className="text-sm text-gray-600 mt-1">{f.comment}</div>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(f.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

