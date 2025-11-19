/**
 * SOUS-BRIQUE 140bis — Sira AI Assistant Component
 */

import React, { useState } from 'react';

export default function AiAssistant() {
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState<'node' | 'php' | 'python'>('node');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function ask() {
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResult('');

    try {
      const resp = await fetch('/api/dev/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, lang }),
      });

      const data = await resp.json();

      if (resp.ok) {
        setResult(data.snippet);
      } else {
        setError(data.error || 'Erreur lors de la génération');
      }
    } catch (err) {
      setError('Impossible de contacter Sira');
    } finally {
      setLoading(false);
    }
  }

  function copySnippet() {
    navigator.clipboard.writeText(result);
  }

  return (
    <div className="p-4 border border-gray-300 rounded-xl bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-6 h-6 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <h2 className="font-semibold text-lg">Sira Dev Assistant</h2>
        <span className="ml-auto text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
          AI-Powered
        </span>
      </div>

      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full border border-gray-300 p-3 mt-2 rounded-md focus:ring-2 focus:ring-blue-500"
        rows={3}
        placeholder="Ex: Comment créer un paiement en XOF avec Node.js ?"
      />

      <div className="flex gap-2 mt-3">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as any)}
          className="border border-gray-300 px-3 py-2 rounded-md focus:ring-2 focus:ring-blue-500"
        >
          <option value="node">Node.js</option>
          <option value="php">PHP</option>
          <option value="python">Python</option>
        </select>

        <button
          onClick={ask}
          disabled={loading || !query.trim()}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Génération...' : '🧠 Générer avec Sira'}
        </button>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Code généré:</span>
            <button
              onClick={copySnippet}
              className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
            >
              Copier
            </button>
          </div>
          <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-md overflow-x-auto font-mono">
            {result}
          </pre>

          {/* Feedback */}
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-gray-600">Ce code est-il utile ?</span>
            <button className="px-2 py-1 text-xs border rounded hover:bg-gray-100">
              👍 Oui
            </button>
            <button className="px-2 py-1 text-xs border rounded hover:bg-gray-100">
              👎 Non
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
