/**
 * SOUS-BRIQUE 140quater-1 — Simulator Ops Panel
 * UI pour créer et gérer simulations sandbox
 */

import React, { useState, useEffect } from 'react';

interface Simulation {
  id: string;
  name: string;
  description: string;
  sdk_language: string;
  scenario: any;
  status: string;
  created_at: string;
}

interface SimulationRun {
  id: string;
  simulation_id: string;
  simulation_name?: string;
  status: string;
  metrics?: {
    success_rate: number;
    avg_latency_ms: number;
    total_requests: number;
    failed_requests: number;
    regressions?: string[];
  };
  run_at: string;
  completed_at?: string;
  duration_seconds?: number;
  artifact_s3_key?: string;
}

export default function SimulatorPanel() {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [selectedSim, setSelectedSim] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state for new simulation
  const [newSim, setNewSim] = useState({
    name: '',
    description: '',
    sdk_language: 'node',
    scenario: {
      error: 'timeout',
      error_frequency: 0.1,
      latency_ms: 200,
      total_requests: 100,
      success_threshold: 0.95,
    },
  });

  useEffect(() => {
    loadSimulations();
    loadRecentRuns();
  }, []);

  async function loadSimulations() {
    try {
      const resp = await fetch('/api/simulator?limit=50');
      const data = await resp.json();
      setSimulations(data.simulations || []);
    } catch (err) {
      console.error('Failed to load simulations:', err);
    }
  }

  async function loadRecentRuns() {
    try {
      const resp = await fetch('/api/ops/simulation-runs?limit=20');
      const data = await resp.json();
      setRuns(data || []);
    } catch (err) {
      console.error('Failed to load runs:', err);
    }
  }

  async function createSimulation() {
    if (!newSim.name) {
      alert('Name is required');
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantType: 'internal',
          name: newSim.name,
          description: newSim.description,
          sdkLanguage: newSim.sdk_language,
          scenario: newSim.scenario,
        }),
      });

      if (resp.ok) {
        const sim = await resp.json();
        setSimulations([sim, ...simulations]);
        setSelectedSim(sim);
        alert('✅ Simulation created!');
      } else {
        alert('❌ Error creating simulation');
      }
    } catch (err) {
      console.error('Error creating simulation:', err);
      alert('❌ Network error');
    } finally {
      setLoading(false);
    }
  }

  async function runSimulation(simId: string) {
    setLoading(true);
    try {
      const idempotencyKey = `ops-${Date.now()}-${Math.random()}`;
      const resp = await fetch(`/api/simulator/${simId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ seed: Date.now() }),
      });

      if (resp.ok) {
        const data = await resp.json();
        alert('✅ Simulation queued!');
        loadRecentRuns();
      } else {
        alert('❌ Error running simulation');
      }
    } catch (err) {
      console.error('Error running simulation:', err);
      alert('❌ Network error');
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      queued: 'bg-yellow-100 text-yellow-800',
      running: 'bg-blue-100 text-blue-800',
      success: 'bg-green-100 text-green-800',
      partial_success: 'bg-orange-100 text-orange-800',
      failed: 'bg-red-100 text-red-800',
      timeout: 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  }

  function formatDuration(seconds?: number): string {
    if (!seconds) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Self-Healing Offline Simulator</h2>
          <p className="text-sm text-gray-600">
            Test patches in isolated sandbox before production
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Create simulation form */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-semibold text-lg mb-4">Create New Simulation</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                className="w-full border px-3 py-2 rounded"
                value={newSim.name}
                onChange={(e) => setNewSim({ ...newSim, name: e.target.value })}
                placeholder="HMAC Signature Test"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="w-full border px-3 py-2 rounded"
                rows={2}
                value={newSim.description}
                onChange={(e) => setNewSim({ ...newSim, description: e.target.value })}
                placeholder="Test HMAC signature patch with 30% error rate"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">SDK Language</label>
              <select
                className="w-full border px-3 py-2 rounded"
                value={newSim.sdk_language}
                onChange={(e) => setNewSim({ ...newSim, sdk_language: e.target.value })}
              >
                <option value="node">Node.js</option>
                <option value="php">PHP</option>
                <option value="python">Python</option>
                <option value="ruby">Ruby</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="shopify">Shopify</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Scenario (JSON)
              </label>
              <textarea
                className="w-full border px-3 py-2 rounded font-mono text-xs"
                rows={8}
                value={JSON.stringify(newSim.scenario, null, 2)}
                onChange={(e) => {
                  try {
                    setNewSim({ ...newSim, scenario: JSON.parse(e.target.value) });
                  } catch {}
                }}
              />
            </div>

            <button
              onClick={createSimulation}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Simulation'}
            </button>
          </div>
        </div>

        {/* Existing simulations */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-semibold text-lg mb-4">
            Simulations ({simulations.length})
          </h3>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {simulations.map((sim) => (
              <div
                key={sim.id}
                className="border rounded p-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedSim(sim)}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="font-medium">{sim.name}</div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${getStatusBadge(
                      sim.status
                    )}`}
                  >
                    {sim.status}
                  </span>
                </div>
                <div className="text-xs text-gray-600">{sim.description}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono">
                    {sim.sdk_language}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      runSimulation(sim.id);
                    }}
                    className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent runs */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold text-lg mb-4">Recent Runs ({runs.length})</h3>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-sm">Simulation</th>
                <th className="px-4 py-2 text-left text-sm">Status</th>
                <th className="px-4 py-2 text-left text-sm">Success Rate</th>
                <th className="px-4 py-2 text-left text-sm">Avg Latency</th>
                <th className="px-4 py-2 text-left text-sm">Duration</th>
                <th className="px-4 py-2 text-left text-sm">Run At</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    {run.simulation_name || run.simulation_id.substring(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded ${getStatusBadge(
                        run.status
                      )}`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {run.metrics
                      ? `${(run.metrics.success_rate * 100).toFixed(1)}%`
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {run.metrics ? `${run.metrics.avg_latency_ms}ms` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {formatDuration(run.duration_seconds)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(run.run_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {runs.length === 0 && (
            <div className="text-center py-8 text-gray-500">No runs yet</div>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <svg
            className="w-5 h-5 text-blue-600 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800 mb-1">
              Sandbox Isolation
            </p>
            <p className="text-xs text-blue-700">
              All simulations run in isolated Docker containers with no network access.
              Patches are tested safely before production deployment. Results are
              automatically anonymized for SIRA training.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
