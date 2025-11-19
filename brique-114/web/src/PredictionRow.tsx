/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Prediction Row Component
 */

import React from "react";

interface Prediction {
  id: string;
  event_id: string;
  score: number;
  decision: string;
  created_at: string;
  feedback_count: number;
  review_queue_status?: string;
}

interface Props {
  prediction: Prediction;
  isSelected: boolean;
  onClick: () => void;
}

export default function PredictionRow({ prediction, isSelected, onClick }: Props) {
  function getDecisionColor(decision: string) {
    const colors: Record<string, string> = {
      approve: "bg-green-100 text-green-800",
      reject: "bg-red-100 text-red-800",
      review: "bg-yellow-100 text-yellow-800",
      block: "bg-red-200 text-red-900"
    };
    return colors[decision] || "bg-gray-100 text-gray-800";
  }

  function getScoreColor(score: number) {
    if (score > 0.8) return "text-red-600 font-semibold";
    if (score > 0.5) return "text-yellow-600";
    return "text-green-600";
  }

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b cursor-pointer transition-colors ${
        isSelected ? "bg-blue-50 border-blue-300" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="font-medium text-sm text-gray-900">{prediction.event_id}</div>
          <div className="text-xs text-gray-500 mt-1">
            {new Date(prediction.created_at).toLocaleString()}
          </div>
          {prediction.feedback_count > 0 && (
            <div className="text-xs text-blue-600 mt-1">
              {prediction.feedback_count} feedback(s)
            </div>
          )}
        </div>
        <div className="text-right ml-4">
          <div className={`text-sm font-medium ${getScoreColor(prediction.score)}`}>
            {(prediction.score * 100).toFixed(1)}%
          </div>
          <div className={`text-xs px-2 py-1 rounded mt-1 ${getDecisionColor(prediction.decision)}`}>
            {prediction.decision}
          </div>
          {prediction.review_queue_status === "open" && (
            <div className="text-xs text-yellow-600 mt-1">⚠️ Pending</div>
          )}
        </div>
      </div>
    </div>
  );
}

