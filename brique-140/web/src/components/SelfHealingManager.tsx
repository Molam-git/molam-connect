/**
 * SOUS-BRIQUE 140quater v2 — Self-Healing Manager Component
 * UI complète pour patches, crowdsourcing, sandbox
 */

import React, { useEffect, useState } from 'react';

interface Patch {
  id: string;
  sdk_language: string;
  error_signature: string;
  description: string;
  severity: string;
  version: string;
  active: boolean;
  rollback_code: string | null;
  source: 'sira' | 'ops' | 'crowd' | 'ai';
  crowd_votes: number;
  sandbox_tested: boolean;
}

interface CrowdPatch {
  id: string;
  sdk_language: string;
  error_signature: string;
  description: string;
  votes_up: number;
  votes_down: number;
  score: number;
  status: 'pending' | 'approved' | 'rejected' | 'testing';
  created_at: string;
}

interface JournalAnalytics {
  sdk_language: string;
  error_signature: string;
  total_applications: number;
  successful: number;
  rollbacks: number;
  avg_execution_time: number;
  last_applied: string;
}

export default function SelfHealingManager() {
  const [patches, setPatches] = useState<Patch[]>([]);
  const [crowdPatches, setCrowdPatches] = useState<CrowdPatch[]>([]);
  const [analytics, setAnalytics] = useState<JournalAnalytics[]>([]);
  const [activeTab, setActiveTab] = useState<'patches' | 'crowd' | 'analytics' | 'sandbox'>(
    'patches'
  );
  const [loading, setLoading] = useState(true);

  // Form pour nouveau patch crowd
  const [newPatch, setNewPatch] = useState({
    sdk_language: 'node',
    error_signature: '',
    proposed_patch_code: '',
    proposed_rollback_code: '',
    description: '',
  });

  useEffect(() => {
    loadPatches();
    loadCrowdPatches();
    loadAnalytics();
  }, []);

  async function loadPatches() {
    try {
      const resp = await fetch('/api/dev/patches');
      const data = await resp.json();
      setPatches(data.patches || []);
    } catch (err) {
      console.error('Failed to load patches:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCrowdPatches() {
    try {
      const resp = await fetch('/api/dev/patch-journal/crowd-patches');
      const data = await resp.json();
      setCrowdPatches(data.crowd_patches || []);
    } catch (err) {
      console.error('Failed to load crowd patches:', err);
    }
  }

  async function loadAnalytics() {
    try {
      const resp = await fetch('/api/dev/patch-journal/analytics');
      const data = await resp.json();
      setAnalytics(data.analytics || []);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
  }

  async function submitCrowdPatch() {
    try {
      const resp = await fetch('/api/dev/patch-journal/crowd-patches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPatch),
      });

      if (resp.ok) {
        alert('✅ Patch soumis avec succès !');
        setNewPatch({
          sdk_language: 'node',
          error_signature: '',
          proposed_patch_code: '',
          proposed_rollback_code: '',
          description: '',
        });
        loadCrowdPatches();
      } else {
        alert('Erreur lors de la soumission');
      }
    } catch (err) {
      console.error('Failed to submit patch:', err);
    }
  }

  async function votePatch(patchId: string, vote: 'up' | 'down') {
    try {
      await fetch(`/api/dev/patch-journal/crowd-patches/${patchId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote }),
      });
      loadCrowdPatches();
    } catch (err) {
      console.error('Failed to vote:', err);
    }
  }

  function getSourceBadge(source: string) {
    const colors = {
      sira: 'bg-purple-100 text-purple-800',
      ops: 'bg-blue-100 text-blue-800',
      crowd: 'bg-green-100 text-green-800',
      ai: 'bg-pink-100 text-pink-800',
    };
    return colors[source as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  }

  function getSuccessRate(item: JournalAnalytics): string {
    if (item.total_applications === 0) return '0%';
    return ((item.successful / item.total_applications) * 100).toFixed(1) + '%';
  }

  if (loading) {
    return <div className="p-4">Chargement...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <div>
            <h2 className="text-2xl font-bold">⚡ Self-Healing SDKs (Molam + Sira)</h2>
            <p className="text-sm text-gray-600">Crowdsourcing, Rollback, Mode Sandbox</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('patches')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'patches'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-600'
          }`}
        >
          Patches Actifs ({patches.filter((p) => p.active).length})
        </button>
        <button
          onClick={() => setActiveTab('crowd')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'crowd'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-600'
          }`}
        >
          Crowdsourcing ({crowdPatches.length})
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'analytics'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-600'
          }`}
        >
          Analytics ({analytics.length})
        </button>
        <button
          onClick={() => setActiveTab('sandbox')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'sandbox'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-600'
          }`}
        >
          🧪 Sandbox
        </button>
      </div>

      {/* Patches actifs */}
      {activeTab === 'patches' && (
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-200 rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-sm">Langage</th>
                <th className="px-4 py-2 text-left text-sm">Erreur</th>
                <th className="px-4 py-2 text-left text-sm">Description</th>
                <th className="px-4 py-2 text-left text-sm">Rollback</th>
                <th className="px-4 py-2 text-left text-sm">Source</th>
                <th className="px-4 py-2 text-left text-sm">Sandbox</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y">
              {patches.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs font-mono bg-blue-100 text-blue-800 rounded">
                      {p.sdk_language}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">{p.error_signature}</td>
                  <td className="px-4 py-3 text-sm">{p.description}</td>
                  <td className="px-4 py-3">
                    {p.rollback_code ? (
                      <span className="text-green-600 font-semibold">✅</span>
                    ) : (
                      <span className="text-red-600">❌</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded ${getSourceBadge(p.source)}`}>
                      {p.source}
                      {p.source === 'crowd' && ` (+${p.crowd_votes})`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.sandbox_tested ? (
                      <span className="text-xs text-green-600">✓ Testé</span>
                    ) : (
                      <span className="text-xs text-gray-400">Non testé</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Crowdsourcing */}
      {activeTab === 'crowd' && (
        <div className="space-y-6">
          {/* Form nouveau patch */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold mb-3">Proposer un nouveau patch</h3>
            <div className="grid grid-cols-2 gap-4">
              <select
                value={newPatch.sdk_language}
                onChange={(e) => setNewPatch({ ...newPatch, sdk_language: e.target.value })}
                className="border px-3 py-2 rounded"
              >
                <option value="node">Node.js</option>
                <option value="php">PHP</option>
                <option value="python">Python</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="shopify">Shopify</option>
              </select>
              <input
                type="text"
                placeholder="Signature erreur (ex: 401)"
                value={newPatch.error_signature}
                onChange={(e) => setNewPatch({ ...newPatch, error_signature: e.target.value })}
                className="border px-3 py-2 rounded"
              />
            </div>
            <textarea
              placeholder="Code du patch..."
              value={newPatch.proposed_patch_code}
              onChange={(e) => setNewPatch({ ...newPatch, proposed_patch_code: e.target.value })}
              className="w-full border px-3 py-2 rounded mt-2 font-mono text-sm"
              rows={4}
            />
            <textarea
              placeholder="Code de rollback (optionnel)..."
              value={newPatch.proposed_rollback_code}
              onChange={(e) =>
                setNewPatch({ ...newPatch, proposed_rollback_code: e.target.value })
              }
              className="w-full border px-3 py-2 rounded mt-2 font-mono text-sm"
              rows={2}
            />
            <input
              type="text"
              placeholder="Description..."
              value={newPatch.description}
              onChange={(e) => setNewPatch({ ...newPatch, description: e.target.value })}
              className="w-full border px-3 py-2 rounded mt-2"
            />
            <button
              onClick={submitCrowdPatch}
              className="mt-3 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Soumettre à la communauté
            </button>
          </div>

          {/* Liste crowd patches */}
          <div className="space-y-3">
            {crowdPatches.map((cp) => (
              <div key={cp.id} className="bg-white border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="px-2 py-1 text-xs font-mono bg-blue-100 text-blue-800 rounded mr-2">
                      {cp.sdk_language}
                    </span>
                    <span className="font-mono text-sm text-gray-700">
                      {cp.error_signature}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                    {cp.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">{cp.description}</p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => votePatch(cp.id, 'up')}
                    className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
                  >
                    👍 {cp.votes_up}
                  </button>
                  <button
                    onClick={() => votePatch(cp.id, 'down')}
                    className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                  >
                    👎 {cp.votes_down}
                  </button>
                  <span className="text-sm text-gray-500">Score: {cp.score}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(cp.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analytics */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {analytics.map((a, idx) => (
            <div key={idx} className="bg-white border rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="px-2 py-1 text-xs font-mono bg-blue-100 text-blue-800 rounded mr-2">
                    {a.sdk_language}
                  </span>
                  <span className="font-mono text-sm">{a.error_signature}</span>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{a.total_applications}</div>
                  <div className="text-xs text-gray-600">Applications</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{a.successful}</div>
                  <div className="text-xs text-gray-600">Succès</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{a.rollbacks}</div>
                  <div className="text-xs text-gray-600">Rollbacks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{getSuccessRate(a)}</div>
                  <div className="text-xs text-gray-600">Taux réussite</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">
                    {Math.round(a.avg_execution_time)}ms
                  </div>
                  <div className="text-xs text-gray-600">Temps moyen</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sandbox */}
      {activeTab === 'sandbox' && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="font-semibold text-lg mb-4">🧪 Mode Sandbox - Test de patches</h3>
          <p className="text-sm text-gray-600 mb-4">
            Le mode sandbox permet de tester un patch dans un environnement isolé avant de
            l'appliquer en production.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <p className="text-sm text-yellow-800">
              <strong>À venir:</strong> Interface de test sandbox avec VM isolée, scénarios
              prédéfinis, et validation automatique.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
