import React, { useState, useEffect } from 'react';

interface Recommendation {
  id: string;
  merchant_id: string;
  recommendation_type: string;
  priority: number;
  reason: string;
  model_version: string;
  dismissed: boolean;
  created_at: string;
}

interface RecommendationCardProps {
  merchantId: string;
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({ merchantId }) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecommendations();
  }, [merchantId]);

  const loadRecommendations = async () => {
    try {
      const res = await fetch(`/api/sira/recommendations/${merchantId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (res.ok) {
        const data = await res.json();
        setRecommendations(data);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissRecommendation = async (id: string) => {
    try {
      const res = await fetch(`/api/sira/recommendations/${id}/dismiss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        setRecommendations(recommendations.filter((r) => r.id !== id));
      }
    } catch (error) {
      console.error('Error dismissing recommendation:', error);
    }
  };

  const getPriorityBadge = (priority: number) => {
    if (priority >= 3) {
      return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">High Priority</span>;
    } else if (priority === 2) {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">Medium Priority</span>;
    } else {
      return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">Low Priority</span>;
    }
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      improve_evidence_quality: '📄',
      reduce_response_time: '⏱️',
      optimize_submission_timing: '📅',
      increase_evidence_count: '📎',
      improve_win_rate: '🎯',
      reduce_dispute_volume: '📉',
    };
    return icons[type] || '💡';
  };

  const getTypeLabel = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-lg text-center">
        <div className="text-4xl mb-2">✅</div>
        <p className="text-gray-600 font-medium">No recommendations at this time</p>
        <p className="text-sm text-gray-500 mt-1">SIRA will notify you when improvements are identified</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">AI Recommendations</h3>
        <span className="text-sm text-gray-500">{recommendations.length} active</span>
      </div>

      {recommendations.map((rec) => (
        <div key={rec.id} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-blue-300 transition">
          <div className="flex items-start gap-3">
            <div className="text-2xl">{getTypeIcon(rec.recommendation_type)}</div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900">{getTypeLabel(rec.recommendation_type)}</h4>
                {getPriorityBadge(rec.priority)}
              </div>
              <p className="text-sm text-gray-700 mb-3">{rec.reason}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {new Date(rec.created_at).toLocaleDateString()} • {rec.model_version}
                </span>
                <button
                  onClick={() => dismissRecommendation(rec.id)}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RecommendationCard;
