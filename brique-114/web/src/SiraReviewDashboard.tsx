/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Reviewer Dashboard - Main UI component
 */

import React, { useEffect, useState } from "react";
import ExplainPanel from "./ExplainPanel";
import PredictionRow from "./PredictionRow";

interface Prediction {
  id: string;
  event_id: string;
  model_id: string;
  product: string;
  score: number;
  decision: string;
  created_at: string;
  feedback_count: number;
  review_queue_status?: string;
}

export default function SiraReviewDashboard() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selectedPrediction, setSelectedPrediction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    loadPredictions();
    loadMetrics();
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadPredictions();
      loadMetrics();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadPredictions() {
    try {
      setLoading(true);
      const res = await fetch(`/api/sira/predictions?limit=50&cursor=${cursor}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      setPredictions(data.rows);
      setCursor(data.cursor);
    } catch (error) {
      console.error("Failed to load predictions:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMetrics() {
    try {
      const res = await fetch("/api/sira/metrics", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      setMetrics(data);
    } catch (error) {
      console.error("Failed to load metrics:", error);
    }
  }

  function getDecisionColor(decision: string) {
    const colors: Record<string, string> = {
      approve: "text-green-600",
      reject: "text-red-600",
      review: "text-yellow-600",
      block: "text-red-800"
    };
    return colors[decision] || "text-gray-600";
  }

  if (loading && predictions.length === 0) {
    return (
      <div className="min-h-screen p-6 bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">SIRA • Review</h1>
          <p className="text-sm text-gray-600 mt-1">Explainability & Feedback Dashboard</p>
        </div>
        {metrics && (
          <div className="flex gap-4">
            <div className="bg-white rounded-lg px-4 py-2 border">
              <div className="text-xs text-gray-600">Total</div>
              <div className="text-lg font-semibold">{metrics.total_predictions}</div>
            </div>
            <div className="bg-white rounded-lg px-4 py-2 border">
              <div className="text-xs text-gray-600">Pending</div>
              <div className="text-lg font-semibold text-yellow-600">{metrics.pending_reviews}</div>
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-3 gap-6">
        {/* Predictions List */}
        <div className="col-span-1">
          <div className="bg-white rounded-lg border shadow-sm">
            <div className="p-4 border-b">
              <h2 className="font-semibold">Predictions</h2>
            </div>
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
              {predictions.map((pred) => (
                <PredictionRow
                  key={pred.id}
                  prediction={pred}
                  isSelected={selectedPrediction === pred.id}
                  onClick={() => setSelectedPrediction(pred.id)}
                />
              ))}
              {predictions.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  Aucune prédiction
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Explain Panel */}
        <div className="col-span-2">
          {selectedPrediction ? (
            <ExplainPanel
              predictionId={selectedPrediction}
              onClose={() => setSelectedPrediction(null)}
            />
          ) : (
            <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-gray-500">
              Sélectionnez une prédiction pour voir les détails
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

