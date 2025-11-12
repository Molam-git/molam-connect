// =====================================================
// Brique 74bis - Banking Network Simulator UI
// =====================================================
// Purpose: Apple-like UI for payment simulation and testing
// Version: 1.0.0
// =====================================================

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3074';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor
apiClient.interceptors.request.use((config) => {
  config.headers['X-User-Id'] = localStorage.getItem('user_id') || 'dev-user-1';
  config.headers['X-Tenant-Id'] = localStorage.getItem('tenant_id') || 'dev-tenant-1';
  config.headers['X-Tenant-Type'] = localStorage.getItem('tenant_type') || 'merchant';
  return config;
});

// =====================================================
// TYPES
// =====================================================

interface Scenario {
  id: string;
  name: string;
  description?: string;
  category: string;
  network: string;
  provider?: string;
  expected_outcome: string;
  response_delay_ms: number;
  requires_3ds: boolean;
  requires_otp: boolean;
  is_preset: boolean;
  tags: string[];
}

interface SimulationResult {
  id: string;
  success: boolean;
  status: string;
  outcome: string;
  response_payload: any;
  response_time_ms: number;
  requires_3ds?: boolean;
  three_ds_flow?: any;
  requires_otp?: boolean;
  otp_flow?: any;
  webhook_events?: any[];
  error?: {
    code: string;
    message: string;
    type: string;
  };
}

// =====================================================
// NETWORK ICONS & COLORS
// =====================================================

const networkConfig: Record<string, { color: string; bg: string; icon: string }> = {
  visa: { color: 'text-blue-600', bg: 'bg-blue-50', icon: '💳' },
  mastercard: { color: 'text-red-600', bg: 'bg-red-50', icon: '💳' },
  amex: { color: 'text-green-600', bg: 'bg-green-50', icon: '💳' },
  mobile_money: { color: 'text-purple-600', bg: 'bg-purple-50', icon: '📱' },
  bank_ach: { color: 'text-indigo-600', bg: 'bg-indigo-50', icon: '🏦' },
  sepa: { color: 'text-gray-600', bg: 'bg-gray-50', icon: '🏦' },
};

// =====================================================
// 1. SCENARIO SELECTION COMPONENT
// =====================================================

export const ScenarioSelector: React.FC<{
  onSelectScenario: (scenario: Scenario) => void;
}> = ({ onSelectScenario }) => {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterNetwork, setFilterNetwork] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');

  useEffect(() => {
    loadScenarios();
  }, [filterNetwork, filterCategory]);

  const loadScenarios = async () => {
    try {
      const params: any = {};
      if (filterNetwork) params.network = filterNetwork;
      if (filterCategory) params.category = filterCategory;

      const response = await apiClient.get('/dev/simulator/scenarios', { params });
      setScenarios(response.data.scenarios);
    } catch (error) {
      console.error('Failed to load scenarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupedScenarios = scenarios.reduce((acc, scenario) => {
    if (!acc[scenario.network]) {
      acc[scenario.network] = [];
    }
    acc[scenario.network].push(scenario);
    return acc;
  }, {} as Record<string, Scenario[]>);

  if (loading) {
    return <div className="p-8 text-center">Loading scenarios...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Banking Network Simulator</h1>
        <p className="text-gray-600 mt-2">Test payment flows with realistic network behaviors</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={filterNetwork}
          onChange={(e) => setFilterNetwork(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 bg-white"
        >
          <option value="">All Networks</option>
          <option value="visa">Visa</option>
          <option value="mastercard">Mastercard</option>
          <option value="mobile_money">Mobile Money</option>
          <option value="bank_ach">Bank ACH</option>
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 bg-white"
        >
          <option value="">All Categories</option>
          <option value="payment">Payment</option>
          <option value="refund">Refund</option>
          <option value="dispute">Dispute</option>
          <option value="3ds">3DS Authentication</option>
        </select>
      </div>

      {/* Scenario Grid */}
      {Object.entries(groupedScenarios).map(([network, networkScenarios]) => (
        <div key={network} className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="text-2xl mr-2">{networkConfig[network]?.icon || '💳'}</span>
            {network.replace('_', ' ').toUpperCase()}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {networkScenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                onSelect={() => onSelectScenario(scenario)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// =====================================================
// 2. SCENARIO CARD COMPONENT
// =====================================================

const ScenarioCard: React.FC<{
  scenario: Scenario;
  onSelect: () => void;
}> = ({ scenario, onSelect }) => {
  const config = networkConfig[scenario.network] || { color: 'text-gray-600', bg: 'bg-gray-50', icon: '💳' };

  return (
    <div
      onClick={onSelect}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl">{config.icon}</span>
        {scenario.is_preset && (
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
            PRESET
          </span>
        )}
      </div>

      <h3 className="font-semibold text-gray-900 mb-2">{scenario.name}</h3>

      {scenario.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{scenario.description}</p>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.color} font-medium`}>
          {scenario.network.replace('_', ' ')}
        </span>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
          {scenario.expected_outcome.replace('_', ' ')}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{scenario.response_delay_ms}ms delay</span>
        {scenario.requires_3ds && <span className="text-purple-600 font-semibold">3DS</span>}
        {scenario.requires_otp && <span className="text-orange-600 font-semibold">OTP</span>}
      </div>
    </div>
  );
};

// =====================================================
// 3. SIMULATION EXECUTOR COMPONENT
// =====================================================

export const SimulationExecutor: React.FC<{
  scenario: Scenario;
  onBack: () => void;
}> = ({ scenario, onBack }) => {
  const [amount, setAmount] = useState(10000);
  const [currency, setCurrency] = useState('XOF');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);

  const executeSimulation = async () => {
    setExecuting(true);
    setResult(null);

    try {
      const response = await apiClient.post('/dev/simulator/simulate', {
        scenario_id: scenario.id,
        amount,
        currency,
        card: scenario.network.includes('card') || scenario.network === 'visa' || scenario.network === 'mastercard'
          ? {
              number: '4242424242424242',
              exp_month: 12,
              exp_year: 2025,
              cvv: '123',
            }
          : undefined,
        mobile_money: scenario.network === 'mobile_money'
          ? {
              phone_number: '+221771234567',
              provider: scenario.provider || 'mtn_momo',
            }
          : undefined,
      });

      setResult(response.data.simulation);
    } catch (error: any) {
      console.error('Simulation failed:', error);
      setResult({
        id: 'error',
        success: false,
        status: 'error',
        outcome: 'error',
        response_payload: {},
        response_time_ms: 0,
        error: {
          code: 'simulation_error',
          message: error.response?.data?.error?.message || error.message,
          type: 'api_error',
        },
      });
    } finally {
      setExecuting(false);
    }
  };

  const verifyOTP = async () => {
    if (!result?.otp_flow) return;

    setOtpVerifying(true);
    try {
      const response = await apiClient.post(`/dev/simulator/otp/${result.otp_flow.id}/verify`, {
        otp_code: otpCode,
      });

      if (response.data.verified) {
        alert('OTP verified successfully! Payment would now be processed.');
        // In real scenario, would trigger payment completion
      } else {
        alert('OTP verification failed: ' + response.data.error.message);
      }
    } catch (error: any) {
      alert('OTP verification failed: ' + (error.response?.data?.error?.message || error.message));
    } finally {
      setOtpVerifying(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button
        onClick={onBack}
        className="mb-6 text-blue-600 hover:text-blue-800 flex items-center font-medium"
      >
        ← Back to Scenarios
      </button>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <h2 className="text-2xl font-bold mb-2">{scenario.name}</h2>
          <p className="text-blue-100">{scenario.description || 'Test this payment scenario'}</p>
        </div>

        {/* Configuration */}
        <div className="p-6 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-4">Payment Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
              >
                <option value="XOF">XOF</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GHS">GHS</option>
              </select>
            </div>
          </div>

          <button
            onClick={executeSimulation}
            disabled={executing}
            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {executing ? 'Executing Simulation...' : 'Run Simulation'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Simulation Result</h3>

            {/* Status Badge */}
            <div className="mb-4">
              <span
                className={`inline-flex items-center px-4 py-2 rounded-full font-semibold ${
                  result.success
                    ? 'bg-green-100 text-green-800'
                    : result.requires_3ds || result.requires_otp
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {result.success ? '✓ Success' : result.requires_3ds ? '🔒 3DS Required' : result.requires_otp ? '📱 OTP Required' : '✗ Failed'}
              </span>
              <span className="ml-3 text-sm text-gray-600">{result.response_time_ms}ms</span>
            </div>

            {/* 3DS Flow */}
            {result.requires_3ds && result.three_ds_flow && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-purple-900 mb-2">3D Secure Authentication</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Version:</span> {result.three_ds_flow.version}
                  </div>
                  <div>
                    <span className="font-medium">Challenge Type:</span> {result.three_ds_flow.challenge_type}
                  </div>
                  <div>
                    <span className="font-medium">Risk Score:</span> {result.three_ds_flow.risk_score}/100
                  </div>
                  {result.three_ds_flow.challenge_url && (
                    <div>
                      <span className="font-medium">Challenge URL:</span>
                      <a
                        href={result.three_ds_flow.challenge_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:underline ml-2"
                      >
                        Open Challenge
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* OTP Flow */}
            {result.requires_otp && result.otp_flow && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-orange-900 mb-2">OTP Verification</h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium">Delivery Method:</span> {result.otp_flow.delivery_method}
                  </div>
                  <div>
                    <span className="font-medium">Phone:</span> {result.otp_flow.phone_number}
                  </div>
                  <div className="bg-yellow-100 border border-yellow-300 rounded p-3 mt-2">
                    <div className="font-semibold text-yellow-900 mb-1">📱 Sandbox OTP Code:</div>
                    <div className="text-2xl font-bold text-yellow-900 tracking-widest">
                      {result.otp_flow.otp_code}
                    </div>
                    <div className="text-xs text-yellow-700 mt-1">
                      Expires at: {new Date(result.otp_flow.expires_at).toLocaleTimeString()}
                    </div>
                  </div>

                  {/* OTP Verification Form */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Enter OTP Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-4 py-2 font-mono text-lg"
                        placeholder="123456"
                        maxLength={6}
                      />
                      <button
                        onClick={verifyOTP}
                        disabled={otpVerifying || otpCode.length !== 6}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-semibold disabled:opacity-50"
                      >
                        {otpVerifying ? 'Verifying...' : 'Verify'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Details */}
            {result.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-red-900 mb-2">Error Details</h4>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="font-medium">Code:</span> {result.error.code}
                  </div>
                  <div>
                    <span className="font-medium">Message:</span> {result.error.message}
                  </div>
                  <div>
                    <span className="font-medium">Type:</span> {result.error.type}
                  </div>
                </div>
              </div>
            )}

            {/* Response Payload */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Response Payload</h4>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto text-xs font-mono">
                {JSON.stringify(result.response_payload, null, 2)}
              </pre>
            </div>

            {/* Webhook Events */}
            {result.webhook_events && result.webhook_events.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold text-gray-900 mb-2">Webhook Events Generated</h4>
                <div className="space-y-2">
                  {result.webhook_events.map((event, idx) => (
                    <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                      <div className="font-semibold text-blue-900">{event.event_type}</div>
                      <div className="text-xs text-blue-700 mt-1">Event ID: {event.id}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// =====================================================
// 4. MAIN BANKING SIMULATOR COMPONENT
// =====================================================

export const BankingSimulator: React.FC = () => {
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);

  if (selectedScenario) {
    return (
      <SimulationExecutor
        scenario={selectedScenario}
        onBack={() => setSelectedScenario(null)}
      />
    );
  }

  return <ScenarioSelector onSelectScenario={setSelectedScenario} />;
};

export default BankingSimulator;
