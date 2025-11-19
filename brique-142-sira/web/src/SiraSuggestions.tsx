/**
 * BRIQUE 142-SIRA — SIRA Suggestions UI
 * Review and approve AI-generated playbook suggestions
 */

import React, { useEffect, useState } from 'react';

interface Suggestion {
  id: string;
  scenario: string;
  confidence: number;
  justification: {
    top_features: Array<{ name: string; value: number }>;
    model_hint?: string;
  };
  proposed_actions: any[];
  status: string;
  generated_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export default function SiraSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');

  useEffect(() => {
    loadSuggestions();
  }, [filter]);

  async function loadSuggestions() {
    try {
      const resp = await fetch(`/api/sira/suggestions?status=${filter}`);
      const data = await resp.json();
      setSuggestions(data);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function approveSuggestion(id: string) {
    if (!confirm('Approve this SIRA suggestion and create playbook?')) return;

    try {
      await fetch(`/api/sira/suggestions/${id}/approve`, { method: 'POST' });
      alert('✅ Suggestion approved! Playbook created.');
      loadSuggestions();
      setSelectedSuggestion(null);
    } catch (err) {
      console.error('Failed to approve:', err);
      alert('❌ Failed to approve suggestion');
    }
  }

  async function rejectSuggestion(id: string) {
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return; // cancelled

    try {
      await fetch(`/api/sira/suggestions/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'manual_reject' }),
      });
      alert('✅ Suggestion rejected');
      loadSuggestions();
      setSelectedSuggestion(null);
    } catch (err) {
      console.error('Failed to reject:', err);
      alert('❌ Failed to reject suggestion');
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getConfidenceColor(confidence: number) {
    if (confidence >= 0.9) return 'text-green-700 font-bold';
    if (confidence >= 0.7) return 'text-blue-700';
    if (confidence >= 0.5) return 'text-yellow-700';
    return 'text-red-700';
  }

  if (loading) {
    return <div className="p-6">Loading SIRA suggestions...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">SIRA AI-Generated Playbooks</h1>
        <p className="text-sm text-gray-600">
          Review and approve playbook suggestions from SIRA
        </p>
      </header>

      {/* Filter */}
      <div className="mb-6 bg-white border rounded-lg p-4">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded ${
              filter === 'pending' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-4 py-2 rounded ${
              filter === 'approved' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-4 py-2 rounded ${
              filter === 'rejected' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            Rejected
          </button>
          <button
            onClick={() => setFilter('')}
            className={`px-4 py-2 rounded ${
              filter === '' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Suggestions Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* List */}
        <div className="col-span-1 bg-white border rounded-lg p-4 max-h-screen overflow-y-auto">
          <h2 className="font-semibold mb-3">Suggestions ({suggestions.length})</h2>

          <div className="space-y-2">
            {suggestions.map((sug) => (
              <div
                key={sug.id}
                className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                  selectedSuggestion?.id === sug.id ? 'bg-blue-50 border-blue-300' : ''
                }`}
                onClick={() => setSelectedSuggestion(sug)}
              >
                <div className="font-medium text-sm">{sug.scenario}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-xs ${getConfidenceColor(sug.confidence)}`}>
                    {(sug.confidence * 100).toFixed(1)}% confidence
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(sug.status)}`}>
                    {sug.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(sug.generated_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {suggestions.length === 0 && (
            <div className="text-center py-8 text-gray-500">No suggestions</div>
          )}
        </div>

        {/* Details */}
        <div className="col-span-2 bg-white border rounded-lg p-6">
          {selectedSuggestion ? (
            <>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">{selectedSuggestion.scenario}</h2>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-lg ${getConfidenceColor(selectedSuggestion.confidence)}`}>
                      Confidence: {(selectedSuggestion.confidence * 100).toFixed(2)}%
                    </span>
                    <span className={`text-sm px-3 py-1 rounded ${getStatusColor(selectedSuggestion.status)}`}>
                      {selectedSuggestion.status}
                    </span>
                  </div>
                </div>

                {selectedSuggestion.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveSuggestion(selectedSuggestion.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => rejectSuggestion(selectedSuggestion.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Justification */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">Justification (Explainability)</h3>
                <div className="bg-gray-50 p-4 rounded">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left pb-2">Feature</th>
                        <th className="text-right pb-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSuggestion.justification.top_features.map((feat, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="py-2">{feat.name}</td>
                          <td className="py-2 text-right font-mono">{feat.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {selectedSuggestion.justification.model_hint && (
                    <div className="mt-2 text-xs text-gray-500">
                      Model: {selectedSuggestion.justification.model_hint}
                    </div>
                  )}
                </div>
              </div>

              {/* Proposed Actions */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">
                  Proposed Actions ({selectedSuggestion.proposed_actions.length})
                </h3>
                <div className="space-y-2">
                  {selectedSuggestion.proposed_actions.map((action: any, idx: number) => (
                    <div key={idx} className="p-3 bg-blue-50 border border-blue-200 rounded">
                      <div className="font-medium text-sm">{action.action}</div>
                      {action.params && (
                        <pre className="text-xs text-gray-700 mt-1 overflow-x-auto">
                          {JSON.stringify(action.params, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Metadata */}
              <div className="text-xs text-gray-500">
                <div>Generated: {new Date(selectedSuggestion.generated_at).toLocaleString()}</div>
                {selectedSuggestion.reviewed_at && (
                  <div>
                    Reviewed: {new Date(selectedSuggestion.reviewed_at).toLocaleString()} by{' '}
                    {selectedSuggestion.reviewed_by}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Select a suggestion to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
