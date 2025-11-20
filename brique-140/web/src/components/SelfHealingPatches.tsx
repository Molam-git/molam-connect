/**
 * SOUS-BRIQUE 140quater — Self-Healing Patches Component
 * UI pour visualiser et gérer les patches auto-correctifs
 */

import React, { useEffect, useState } from 'react';

interface Patch {
  id: string;
  sdk_language: string;
  error_signature: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  version: string;
  active: boolean;
}

interface PatchStat {
  sdk_language: string;
  error_signature: string;
  description: string;
  applications_count: number;
  success_count: number;
  rollback_count: number;
}

export default function SelfHealingPatches() {
  const [patches, setPatches] = useState<Patch[]>([]);
  const [stats, setStats] = useState<PatchStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'patches' | 'stats'>('patches');

  useEffect(() => {
    loadPatches();
    loadStats();
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

  async function loadStats() {
    try {
      const resp = await fetch('/api/dev/patches/stats');
      const data = await resp.json();
      setStats(data.stats || []);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  function getSeverityColor(severity: string) {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getSuccessRate(stat: PatchStat): string {
    if (stat.applications_count === 0) return '0%';
    const rate = (stat.success_count / stat.applications_count) * 100;
    return `${rate.toFixed(1)}%`;
  }

  if (loading) {
    return <div className="p-4">Chargement...</div>;
  }

  return (
    <div className="p-4 border rounded-xl bg-gradient-to-br from-green-50 to-blue-50">
      <div className="flex items-center gap-2 mb-4">
        <svg
          className="w-6 h-6 text-green-600"
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
        <h3 className="font-semibold text-lg">Self-Healing SDKs — Active Patches</h3>
        <span className="ml-auto text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
          {patches.filter((p) => p.active).length} actifs
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setActiveTab('patches')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'patches'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Patches ({patches.length})
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'stats'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Statistiques ({stats.length})
        </button>
      </div>

      {/* Patches List */}
      {activeTab === 'patches' && (
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold">Langage</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Erreur</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Description</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Sévérité</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Version</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {patches.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-1 text-xs font-mono bg-blue-100 text-blue-800 rounded">
                      {p.sdk_language}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-700">
                    {p.error_signature}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.description}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 text-xs font-semibold rounded ${getSeverityColor(
                        p.severity
                      )}`}
                    >
                      {p.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.version}</td>
                  <td className="px-4 py-3">
                    {p.active ? (
                      <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        ✓ Actif
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                        Inactif
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {patches.length === 0 && (
            <div className="text-center py-8 text-gray-500">Aucun patch disponible</div>
          )}
        </div>
      )}

      {/* Stats */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block px-2 py-1 text-xs font-mono bg-blue-100 text-blue-800 rounded">
                      {stat.sdk_language}
                    </span>
                    <span className="font-mono text-sm text-gray-700">
                      {stat.error_signature}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{stat.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mt-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {stat.applications_count}
                  </div>
                  <div className="text-xs text-gray-600">Applications</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {stat.success_count}
                  </div>
                  <div className="text-xs text-gray-600">Succès</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {stat.rollback_count}
                  </div>
                  <div className="text-xs text-gray-600">Rollbacks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {getSuccessRate(stat)}
                  </div>
                  <div className="text-xs text-gray-600">Taux réussite</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{
                      width: getSuccessRate(stat),
                    }}
                  />
                </div>
              </div>
            </div>
          ))}

          {stats.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Aucune statistique disponible
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
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
              Self-Healing automatique
            </p>
            <p className="text-xs text-blue-700">
              Les SDKs Molam détectent et corrigent automatiquement les erreurs courantes
              (clé API manquante, timeout, devise invalide, etc.) sans intervention humaine.
              Chaque patch est audité et peut être rollback si nécessaire.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
