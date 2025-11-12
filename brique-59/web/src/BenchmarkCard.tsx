import React, { useState, useEffect } from 'react';

interface MerchantProfile {
  merchant_id: string;
  sector: string;
  country: string;
  currency: string;
  total_disputes: number;
  win_rate: number;
  loss_rate: number;
  settled_rate: number;
  avg_resolution_days: number;
  evidence_quality_score: number;
  sira_accuracy: number;
  benchmark_win_rate: number;
  benchmark_resolution_days: number;
  updated_at: string;
}

interface BenchmarkCardProps {
  merchantId: string;
  onClose?: () => void;
}

const BenchmarkCard: React.FC<BenchmarkCardProps> = ({ merchantId, onClose }) => {
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, [merchantId]);

  const loadProfile = async () => {
    try {
      const res = await fetch(`/api/sira/profiles/${merchantId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const getPerformanceIndicator = (value: number, benchmark: number, higher_is_better: boolean = true) => {
    const diff = value - benchmark;
    const isGood = higher_is_better ? diff > 0 : diff < 0;

    if (Math.abs(diff) < 2) {
      return { color: 'text-gray-600', icon: '→', label: 'On Par' };
    } else if (isGood) {
      return { color: 'text-green-600', icon: '↑', label: 'Above Average' };
    } else {
      return { color: 'text-red-600', icon: '↓', label: 'Below Average' };
    }
  };

  const winRateIndicator = getPerformanceIndicator(profile.win_rate, profile.benchmark_win_rate, true);
  const resolutionIndicator = getPerformanceIndicator(
    profile.avg_resolution_days,
    profile.benchmark_resolution_days,
    false
  );

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border-2 border-indigo-200 rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <h3 className="text-xl font-bold text-gray-900">Performance vs Sector</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        )}
      </div>

      <div className="text-sm text-gray-600 mb-4">
        {profile.sector} • {profile.country} • Last updated: {new Date(profile.updated_at).toLocaleDateString()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Win Rate */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Win Rate</span>
            <span className={`text-sm font-semibold ${winRateIndicator.color}`}>
              {winRateIndicator.icon} {winRateIndicator.label}
            </span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">{profile.win_rate.toFixed(1)}%</div>
          <div className="text-sm text-gray-500">
            Sector Avg: {profile.benchmark_win_rate.toFixed(1)}%
            <span className={winRateIndicator.color}>
              {' '}
              ({profile.win_rate > profile.benchmark_win_rate ? '+' : ''}
              {(profile.win_rate - profile.benchmark_win_rate).toFixed(1)}%)
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                profile.win_rate > profile.benchmark_win_rate ? 'bg-green-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(profile.win_rate, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Resolution Time */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Avg Resolution Time</span>
            <span className={`text-sm font-semibold ${resolutionIndicator.color}`}>
              {resolutionIndicator.icon} {resolutionIndicator.label}
            </span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">{profile.avg_resolution_days.toFixed(0)} days</div>
          <div className="text-sm text-gray-500">
            Sector Avg: {profile.benchmark_resolution_days.toFixed(0)} days
            <span className={resolutionIndicator.color}>
              {' '}
              ({profile.avg_resolution_days > profile.benchmark_resolution_days ? '+' : ''}
              {(profile.avg_resolution_days - profile.benchmark_resolution_days).toFixed(0)} days)
            </span>
          </div>
        </div>

        {/* Evidence Quality */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Evidence Quality</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {(profile.evidence_quality_score * 100).toFixed(0)}%
          </div>
          <div className="text-sm text-gray-500">Based on completeness and submission timing</div>
        </div>

        {/* SIRA Accuracy */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">SIRA Prediction Accuracy</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">{(profile.sira_accuracy * 100).toFixed(0)}%</div>
          <div className="text-sm text-gray-500">
            {profile.sira_accuracy > 0.75 ? '🎯 Excellent' : profile.sira_accuracy > 0.6 ? '✓ Good' : '⚠️ Improving'}
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="mt-4 pt-4 border-t border-indigo-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Total Disputes Analyzed:</span>
          <span className="font-semibold text-gray-900">{profile.total_disputes.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-gray-600">Win / Loss / Settled:</span>
          <span className="font-semibold text-gray-900">
            {profile.win_rate.toFixed(0)}% / {profile.loss_rate.toFixed(0)}% / {profile.settled_rate.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default BenchmarkCard;
