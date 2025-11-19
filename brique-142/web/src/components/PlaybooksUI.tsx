/**
 * BRIQUE 142 — Playbooks UI
 * Automated response playbooks management
 */

import React, { useEffect, useState } from 'react';

interface Playbook {
  id: string;
  name: string;
  description: string;
  triggers: any;
  actions: any[];
  auto_execute: boolean;
  require_approval: boolean;
  active: boolean;
  created_at: string;
}

export default function PlaybooksUI() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [executions, setExecutions] = useState<any[]>([]);

  useEffect(() => {
    loadPlaybooks();
  }, []);

  useEffect(() => {
    if (selectedPlaybook) {
      loadExecutions(selectedPlaybook.id);
    }
  }, [selectedPlaybook]);

  async function loadPlaybooks() {
    try {
      const resp = await fetch('/api/playbooks');
      const data = await resp.json();
      setPlaybooks(data);
    } catch (err) {
      console.error('Failed to load playbooks:', err);
    }
  }

  async function loadExecutions(playbookId: string) {
    try {
      const resp = await fetch(`/api/playbooks/${playbookId}/executions`);
      const data = await resp.json();
      setExecutions(data);
    } catch (err) {
      console.error('Failed to load executions:', err);
    }
  }

  async function executePlaybook(playbookId: string) {
    if (!confirm('Execute this playbook?')) return;

    try {
      await fetch(`/api/playbooks/${playbookId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: null }),
      });

      alert('✅ Playbook queued for execution');
      loadExecutions(playbookId);
    } catch (err) {
      console.error('Failed to execute playbook:', err);
      alert('❌ Failed to execute playbook');
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      running: 'bg-blue-100 text-blue-800',
      success: 'bg-green-100 text-green-800',
      partial: 'bg-orange-100 text-orange-800',
      failed: 'bg-red-100 text-red-800',
      rolled_back: 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Playbooks</h1>
        <p className="text-sm text-gray-600">Automated response templates</p>
      </header>

      <div className="grid grid-cols-3 gap-6">
        {/* Playbooks list */}
        <div className="col-span-1 bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Playbooks ({playbooks.length})</h2>

          <ul className="space-y-2">
            {playbooks.map((playbook) => (
              <li
                key={playbook.id}
                className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                  selectedPlaybook?.id === playbook.id ? 'bg-blue-50 border-blue-300' : ''
                }`}
                onClick={() => setSelectedPlaybook(playbook)}
              >
                <div className="font-medium">{playbook.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  {playbook.auto_execute && (
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                      Auto
                    </span>
                  )}
                  {playbook.require_approval && (
                    <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                      Approval
                    </span>
                  )}
                  {!playbook.active && (
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded">
                      Inactive
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Playbook details */}
        <div className="col-span-2 bg-white border rounded-lg p-6">
          {selectedPlaybook ? (
            <>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">{selectedPlaybook.name}</h2>
                  <p className="text-sm text-gray-600 mt-1">{selectedPlaybook.description}</p>
                </div>
                <button
                  onClick={() => executePlaybook(selectedPlaybook.id)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={!selectedPlaybook.active}
                >
                  Execute Now
                </button>
              </div>

              {/* Triggers */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">Triggers</h3>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(selectedPlaybook.triggers, null, 2)}
                </pre>
              </div>

              {/* Actions */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">Actions ({selectedPlaybook.actions.length})</h3>
                <ul className="space-y-2">
                  {selectedPlaybook.actions.map((action: any, idx: number) => (
                    <li key={idx} className="p-3 bg-gray-50 rounded border">
                      <div className="font-medium text-sm">{action.type}</div>
                      {action.params && (
                        <pre className="text-xs text-gray-600 mt-1">
                          {JSON.stringify(action.params, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Execution history */}
              <div>
                <h3 className="font-semibold mb-3">Execution History ({executions.length})</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {executions.map((exec) => (
                    <div key={exec.id} className="p-3 border rounded text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className={`px-2 py-1 text-xs rounded ${getStatusBadge(exec.status)}`}>
                          {exec.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(exec.executed_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        Mode: {exec.execution_mode} • By: {exec.executed_by}
                      </div>
                    </div>
                  ))}

                  {executions.length === 0 && (
                    <div className="text-center py-4 text-gray-500">No executions yet</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Select a playbook to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
