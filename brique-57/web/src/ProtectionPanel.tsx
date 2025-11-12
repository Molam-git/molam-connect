import React, { useState, useEffect } from 'react';

interface ProtectionStatus {
  level: 'basic' | 'premium' | 'guaranteed';
  features: string[];
  chargeback_protection: boolean;
  guaranteed_coverage: boolean;
  activated_at?: string;
}

interface FraudKPI {
  total_payments: number;
  total_volume: number;
  fraud_payments: number;
  fraud_volume: number;
  fraud_rate: number;
  chargeback_count: number;
  chargeback_rate: number;
  blocked_payments: number;
  blocked_volume: number;
  challenged_payments: number;
  whitelist_hits: number;
  blacklist_hits: number;
  avg_sira_score: number;
}

const ProtectionPanel: React.FC = () => {
  const [status, setStatus] = useState<ProtectionStatus | null>(null);
  const [kpis, setKpis] = useState<FraudKPI | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statusRes, kpisRes, alertsRes] = await Promise.all([
        fetch('/api/merchant-protection/status', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        fetch('/api/merchant-protection/kpis?start_date=' + new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        fetch('/api/merchant-protection/alerts/count', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
      ]);

      const statusData = await statusRes.json();
      const kpisData = await kpisRes.json();
      const alertsData = await alertsRes.json();

      setStatus(statusData);
      setKpis(kpisData);
      setAlertCount(alertsData.count);
    } catch (error) {
      console.error('Error loading protection data:', error);
    } finally {
      setLoading(false);
    }
  };

  const upgradeProtection = async (level: 'basic' | 'premium' | 'guaranteed') => {
    setUpgrading(true);
    try {
      const res = await fetch('/api/merchant-protection/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ level }),
      });

      if (res.ok) {
        await loadData();
        alert(`Successfully upgraded to ${level} protection!`);
      } else {
        alert('Failed to upgrade protection');
      }
    } catch (error) {
      console.error('Error upgrading protection:', error);
      alert('Failed to upgrade protection');
    } finally {
      setUpgrading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading protection status...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Fraud Protection</h1>
        <p className="text-gray-600 mt-1">Manage your fraud prevention tools and protection level</p>
      </div>

      {/* Alert Banner */}
      {alertCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex items-center">
            <span className="text-red-700 font-semibold">
              {alertCount} fraud alert{alertCount !== 1 ? 's' : ''} in the last 24 hours
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Fraud Rate</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {kpis?.fraud_rate.toFixed(2)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {kpis?.fraud_payments} / {kpis?.total_payments} payments
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Chargeback Rate</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {kpis?.chargeback_rate.toFixed(2)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {kpis?.chargeback_count} chargebacks
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Blocked Payments</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {kpis?.blocked_payments}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ${(kpis?.blocked_volume || 0).toFixed(2)} prevented
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Avg SIRA Score</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {(kpis?.avg_sira_score || 0).toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">ML fraud score</div>
        </div>
      </div>

      {/* Protection Levels */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Protection Level</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Basic */}
          <div className={`bg-white p-6 rounded-lg shadow ${status?.level === 'basic' ? 'ring-2 ring-blue-500' : ''}`}>
            <div className="text-lg font-bold text-gray-900">Basic</div>
            <div className="text-2xl font-bold text-gray-900 mt-2">Free</div>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li>✓ Basic fraud detection</li>
              <li>✓ Whitelist / Blacklist</li>
              <li>✓ Fraud alerts</li>
            </ul>
            {status?.level === 'basic' ? (
              <div className="mt-6 text-center text-blue-600 font-semibold">Current Plan</div>
            ) : (
              <button
                onClick={() => upgradeProtection('basic')}
                disabled={upgrading}
                className="mt-6 w-full bg-gray-200 text-gray-700 py-2 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Downgrade
              </button>
            )}
          </div>

          {/* Premium */}
          <div className={`bg-white p-6 rounded-lg shadow ${status?.level === 'premium' ? 'ring-2 ring-blue-500' : ''}`}>
            <div className="text-lg font-bold text-gray-900">Premium</div>
            <div className="text-2xl font-bold text-gray-900 mt-2">$299/mo</div>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li>✓ Everything in Basic</li>
              <li>✓ Advanced Radar rules</li>
              <li>✓ Velocity checks</li>
              <li>✓ Chargeback protection</li>
              <li>✓ Email & Slack alerts</li>
            </ul>
            {status?.level === 'premium' ? (
              <div className="mt-6 text-center text-blue-600 font-semibold">Current Plan</div>
            ) : (
              <button
                onClick={() => upgradeProtection('premium')}
                disabled={upgrading}
                className="mt-6 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Upgrade
              </button>
            )}
          </div>

          {/* Guaranteed */}
          <div className={`bg-white p-6 rounded-lg shadow ${status?.level === 'guaranteed' ? 'ring-2 ring-blue-500' : ''}`}>
            <div className="text-lg font-bold text-gray-900">Guaranteed</div>
            <div className="text-2xl font-bold text-gray-900 mt-2">$999/mo</div>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li>✓ Everything in Premium</li>
              <li>✓ Chargeback guarantee</li>
              <li>✓ Custom rules</li>
              <li>✓ Priority support</li>
              <li>✓ 100% coverage</li>
            </ul>
            {status?.level === 'guaranteed' ? (
              <div className="mt-6 text-center text-blue-600 font-semibold">Current Plan</div>
            ) : (
              <button
                onClick={() => upgradeProtection('guaranteed')}
                disabled={upgrading}
                className="mt-6 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 rounded hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
              >
                Upgrade
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Current Features */}
      {status && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Active Features</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {status.features.map((feature) => (
              <div key={feature} className="flex items-center text-sm text-gray-700">
                <span className="text-green-500 mr-2">✓</span>
                {feature.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProtectionPanel;
