// ============================================================================
// Brique 124 — Treasury Ops UI (React)
// ============================================================================

import React, { useEffect, useState } from "react";

export default function TreasuryOpsUI() {
  const [plans, setPlans] = useState<any[]>([]);

  async function loadPlans() {
    const res = await fetch('/api/treasury/plans?status=proposed,approved');
    setPlans(await res.json());
  }

  useEffect(() => { loadPlans(); }, []);

  async function approve(planId: string) {
    await fetch(`/api/treasury/plans/${planId}/approve`, { method: 'POST' });
    loadPlans();
  }

  async function execute(planId: string) {
    await fetch(`/api/treasury/plans/${planId}/execute`, {
      method: 'POST',
      headers: { 'Idempotency-Key': planId }
    });
    loadPlans();
  }

  async function rollback(planId: string) {
    await fetch(`/api/treasury/plans/${planId}/rollback`, { method: 'POST' });
    loadPlans();
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Treasury Ops</h1>
      <div className="space-y-4">
        {plans.map(p => (
          <div key={p.id} className="p-4 border rounded-xl flex justify-between">
            <div>
              <div className="font-medium">{p.plan_type} • {p.status}</div>
              <div className="text-sm text-gray-500">{p.priority} • {new Date(p.created_at).toLocaleString()}</div>
            </div>
            <div className="space-x-2">
              {p.status === 'proposed' && <button onClick={() => approve(p.id)} className="px-3 py-1 border rounded">Approve</button>}
              {p.status === 'approved' && <button onClick={() => execute(p.id)} className="px-3 py-1 bg-blue-600 text-white rounded">Execute</button>}
              {(p.status === 'executed' || p.status === 'failed') && <button onClick={() => rollback(p.id)} className="px-3 py-1 border rounded">Rollback</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
