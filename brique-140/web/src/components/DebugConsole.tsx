/**
 * SOUS-BRIQUE 140ter — Debug Console Component
 * UI pour auto-debug avec Sira
 */

import React, { useState, useEffect } from 'react';

interface Fix {
  action: string;
  snippet: string;
  category: string;
}

export default function DebugConsole() {
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'node' | 'php' | 'python'>('node');
  const [fix, setFix] = useState<Fix | null>(null);
  const [loading, setLoading] = useState(false);
  const [unresolvedErrors, setUnresolvedErrors] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);

  useEffect(() => {
    loadUnresolvedErrors();
    loadStats();
  }, []);

  async function submit() {
    if (!error.trim()) return;

    setLoading(true);
    setFix(null);

    try {
      const resp = await fetch('/api/debug/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang,
          error_message: error,
          context: { env: 'test', timestamp: new Date().toISOString() },
        }),
      });

      const data = await resp.json();
      if (resp.ok) {
        setFix(data.fix);
        loadUnresolvedErrors(); // Refresh list
      } else {
        alert('Erreur lors de l\'analyse');
      }
    } catch (err) {
      console.error(err);
      alert('Impossible de contacter le service de debug');
    } finally {
      setLoading(false);
    }
  }

  async function loadUnresolvedErrors() {
    try {
      const resp = await fetch('/api/debug/unresolved');
      const data = await resp.json();
      setUnresolvedErrors(data.errors || []);
    } catch (err) {
      console.error('Failed to load unresolved errors:', err);
    }
  }

  async function loadStats() {
    try {
      const resp = await fetch('/api/debug/stats');
      const data = await resp.json();
      setStats(data.stats || []);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async function markResolved(logId: string) {
    try {
      await fetch(`/api/debug/${logId}/resolve`, { method: 'POST' });
      loadUnresolvedErrors();
      loadStats();
    } catch (err) {
      console.error('Failed to mark resolved:', err);
    }
  }

  function copySnippet() {
    if (fix?.snippet) {
      navigator.clipboard.writeText(fix.snippet);
    }
  }

  return (
    <div className="p-4 border rounded-xl bg-gradient-to-br from-red-50 to-orange-50">
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-6 h-6 text-red-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h3 className="font-semibold text-lg">Auto-Debug Console (Sira)</h3>
        <span className="ml-auto text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">
          Pattern Analysis
        </span>
      </div>

      <textarea
        value={error}
        onChange={(e) => setError(e.target.value)}
        className="w-full p-3 mt-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500"
        rows={4}
        placeholder="Collez l'erreur API ici... (ex: 401 Unauthorized, timeout, invalid_currency)"
      />

      <div className="flex gap-2 mt-3">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as any)}
          className="border border-gray-300 px-3 py-2 rounded-md focus:ring-2 focus:ring-red-500"
        >
          <option value="node">Node.js</option>
          <option value="php">PHP</option>
          <option value="python">Python</option>
        </select>

        <button
          onClick={submit}
          disabled={loading || !error.trim()}
          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyse...' : '🔍 Analyser'}
        </button>
      </div>

      {fix && (
        <div className="mt-4 bg-white border border-red-200 rounded-md p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-semibold text-red-800">Suggestion:</p>
              <p className="text-sm text-gray-700">{fix.action}</p>
              {fix.category && (
                <span className="inline-block mt-1 text-xs px-2 py-1 bg-gray-200 rounded">
                  {fix.category}
                </span>
              )}
            </div>
            <button
              onClick={copySnippet}
              className="text-xs px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded"
            >
              Copier
            </button>
          </div>
          <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded-md overflow-x-auto font-mono mt-2">
            {fix.snippet}
          </pre>
        </div>
      )}

      {/* Stats dashboard */}
      {stats.length > 0 && (
        <div className="mt-4 p-3 bg-white border rounded-md">
          <h4 className="font-semibold text-sm mb-2">Statistiques d'erreurs</h4>
          <div className="space-y-1">
            {stats.map((stat, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span>
                  {stat.sdk_language} - {stat.category || 'unknown'}
                </span>
                <span className="text-gray-600">
                  {stat.resolved_count}/{stat.total} résolues
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unresolved errors list */}
      {unresolvedErrors.length > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <h4 className="font-semibold text-sm mb-2">Erreurs non résolues</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {unresolvedErrors.map((err) => (
              <div key={err.id} className="text-xs bg-white p-2 rounded border">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <span className="font-mono text-red-600">
                      {err.error_message.substring(0, 80)}
                      {err.error_message.length > 80 ? '...' : ''}
                    </span>
                    <div className="text-gray-500 mt-1">
                      {err.sdk_language} •{' '}
                      {new Date(err.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <button
                    onClick={() => markResolved(err.id)}
                    className="ml-2 px-2 py-1 text-xs bg-green-100 hover:bg-green-200 rounded"
                  >
                    ✓ Résolu
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
