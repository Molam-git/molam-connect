/**
 * BRIQUE 141 — Ops Dashboard
 * UI pour créer, approuver, exécuter plans opérationnels
 */

import React, { useEffect, useState } from 'react';

interface OpsPlan {
  id: string;
  external_id?: string;
  name: string;
  description?: string;
  plan_type: string;
  status: string;
  required_approvals: number;
  approvals_count: number;
  estimated_impact?: any;
  created_at: string;
  runs_count: number;
  successful_runs: number;
}

export default function OpsDashboard() {
  const [plans, setPlans] = useState<OpsPlan[]>([]);
  const [selected, setSelected] = useState<OpsPlan | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    try {
      const resp = await fetch('/api/ops/plans?limit=50');
      const data = await resp.json();
      setPlans(data);
    } catch (err) {
      console.error('Failed to load plans:', err);
    }
  }

  async function createSamplePlan() {
    setLoading(true);
    try {
      const body = {
        external_id: `plan-${Date.now()}`,
        name: 'Payout batch regional EUR',
        description: 'Monthly EUR payouts for merchants',
        plan_type: 'payout_batch',
        payload: {
          currency: 'EUR',
          cutoff_date: '2025-08-01',
          total_amount: 150000,
          simulate_before_execute: true,
          min_success_threshold: 0.95,
        },
        required_approvals: 2,
      };

      const res = await fetch('/api/ops/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const plan = await res.json();
        setPlans([plan, ...plans]);
        setSelected(plan);
      } else {
        alert('Error creating plan');
      }
    } catch (err) {
      console.error('Error creating plan:', err);
    } finally {
      setLoading(false);
    }
  }

  async function stageSelected() {
    if (!selected) return;
    try {
      await fetch(`/api/ops/plans/${selected.id}/stage`, { method: 'POST' });
      loadPlans();
    } catch (err) {
      console.error('Error staging plan:', err);
    }
  }

  async function approveSelected() {
    if (!selected) return;
    try {
      await fetch(`/api/ops/plans/${selected.id}/approve`, { method: 'POST' });
      loadPlans();
    } catch (err) {
      console.error('Error approving plan:', err);
    }
  }

  async function executeSelected() {
    if (!selected) return;
    const idempotency = `exec-${Date.now()}`;
    try {
      await fetch(`/api/ops/plans/${selected.id}/execute`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotency },
      });
      loadPlans();
    } catch (err) {
      console.error('Error executing plan:', err);
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      staged: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      executing: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-200 text-green-900',
      failed: 'bg-red-100 text-red-800',
      rolled_back: 'bg-purple-100 text-purple-800',
      cancelled: 'bg-gray-200 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  }

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ops • Plans</h1>
          <p className="text-sm text-gray-600">
            Generate, simulate, approve & execute operational plans
          </p>
        </div>
        <button
          onClick={createSamplePlan}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : '+ New Plan'}
        </button>
      </header>

      <main className="grid grid-cols-3 gap-6">
        {/* Plans list */}
        <section className="col-span-1 bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Plans ({plans.length})</h2>
          <ul className="space-y-2 max-h-screen overflow-y-auto">
            {plans.map((p) => (
              <li
                key={p.id}
                className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                  selected?.id === p.id ? 'bg-blue-50 border-blue-300' : ''
                }`}
                onClick={() => setSelected(p)}
              >
                <div className="font-medium">{p.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-1 rounded ${getStatusBadge(p.status)}`}>
                    {p.status}
                  </span>
                  <span className="text-xs text-gray-600">{p.plan_type}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Approvals: {p.approvals_count}/{p.required_approvals}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Plan details */}
        <section className="col-span-2 bg-white border rounded-lg p-6">
          {selected ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  <span className={`text-xs px-2 py-1 rounded ${getStatusBadge(selected.status)} mt-1 inline-block`}>
                    {selected.status}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {new Date(selected.created_at).toLocaleDateString()}
                </div>
              </div>

              {selected.description && (
                <p className="text-sm text-gray-700 mb-4">{selected.description}</p>
              )}

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-xs text-gray-600">Type</div>
                  <div className="font-medium">{selected.plan_type}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-xs text-gray-600">Approvals</div>
                  <div className="font-medium">
                    {selected.approvals_count}/{selected.required_approvals}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-xs text-gray-600">Runs</div>
                  <div className="font-medium">{selected.runs_count}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-xs text-gray-600">Successful</div>
                  <div className="font-medium">{selected.successful_runs}</div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={stageSelected}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  disabled={selected.status !== 'draft'}
                >
                  Stage
                </button>
                <button
                  onClick={approveSelected}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  disabled={selected.status !== 'staged'}
                >
                  Approve
                </button>
                <button
                  onClick={executeSelected}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={selected.status !== 'approved'}
                >
                  Execute
                </button>
              </div>

              {/* Journal */}
              <div className="mt-6">
                <h3 className="font-semibold mb-3">Audit Journal</h3>
                <JournalList planId={selected.id} />
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500 py-12">
              Select a plan to view details
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function JournalList({ planId }: { planId: string }) {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (planId) {
      fetch(`/api/ops/plans/${planId}/journal`)
        .then((r) => r.json())
        .then(setRows);
    }
  }, [planId]);

  return (
    <ul className="space-y-2 max-h-64 overflow-y-auto">
      {rows.map((r) => (
        <li key={r.id} className="p-3 border rounded text-sm">
          <div className="flex justify-between items-start mb-1">
            <span className="font-medium">{r.action}</span>
            <span className="text-xs text-gray-500">
              {new Date(r.created_at).toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-gray-600">
            {r.role} • {JSON.stringify(r.details)}
          </div>
        </li>
      ))}

      {rows.length === 0 && (
        <div className="text-center text-gray-500 py-4">No journal entries yet</div>
      )}
    </ul>
  );
}
