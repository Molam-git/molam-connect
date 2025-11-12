import React, { useState, useEffect } from 'react';

interface Dispute {
  id: string;
  connect_tx_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  dispute_type: string;
  customer_note?: string;
  respond_by?: string;
  resolved_at?: string;
  outcome?: string;
  created_at: string;
  network_ref?: string;
}

interface Evidence {
  id: string;
  evidence_type: string;
  file_url?: string;
  file_name?: string;
  notes?: string;
  uploaded_by: string;
  uploaded_at: string;
}

interface Log {
  id: string;
  action: string;
  actor: string;
  details?: any;
  created_at: string;
}

interface Fee {
  id: string;
  fee_type: string;
  amount: number;
  currency: string;
  status: string;
  charged_at?: string;
}

interface DisputeDetailProps {
  disputeId: string;
}

export default function DisputeDetail({ disputeId }: DisputeDetailProps) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'evidence' | 'logs' | 'fees'>('evidence');

  // Evidence submission form
  const [evidenceText, setEvidenceText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDispute();
    fetchEvidence();
    fetchLogs();
    fetchFees();
  }, [disputeId]);

  const fetchDispute = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:4066/api/disputes/${disputeId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch dispute');
      }

      const data = await response.json();
      setDispute(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching dispute:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvidence = async () => {
    try {
      const response = await fetch(`http://localhost:4066/api/disputes/${disputeId}/evidence`);
      if (response.ok) {
        const data = await response.json();
        setEvidence(data);
      }
    } catch (err: any) {
      console.error('Error fetching evidence:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch(`http://localhost:4066/api/disputes/${disputeId}/logs`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (err: any) {
      console.error('Error fetching logs:', err);
    }
  };

  const fetchFees = async () => {
    try {
      const response = await fetch(`http://localhost:4066/api/disputes/${disputeId}/fees`);
      if (response.ok) {
        const data = await response.json();
        setFees(data);
      }
    } catch (err: any) {
      console.error('Error fetching fees:', err);
    }
  };

  const handleSubmitEvidence = async () => {
    if (!evidenceText.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch(`http://localhost:4066/api/disputes/${disputeId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: 'merchant-user',
          evidence: { text: evidenceText }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit evidence');
      }

      setEvidenceText('');
      await fetchDispute();
      await fetchEvidence();
      await fetchLogs();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (outcome: 'won' | 'lost') => {
    const notes = prompt(`Enter resolution notes for outcome: ${outcome}`);
    if (!notes) return;

    try {
      const response = await fetch(`http://localhost:4066/api/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: 'admin',
          outcome,
          notes
        })
      });

      if (!response.ok) {
        throw new Error('Failed to resolve dispute');
      }

      await fetchDispute();
      await fetchLogs();
      await fetchFees();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-yellow-100 text-yellow-800',
      evidence_submitted: 'bg-blue-100 text-blue-800',
      under_review: 'bg-purple-100 text-purple-800',
      won: 'bg-green-100 text-green-800',
      lost: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading dispute details...</div>
      </div>
    );
  }

  if (error || !dispute) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error || 'Dispute not found'}
        </div>
      </div>
    );
  }

  const totalFees = fees.reduce((sum, fee) => fee.status === 'charged' ? sum + fee.amount : sum, 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Dispute Details</h1>
            <p className="text-gray-600 mt-1">Transaction: {dispute.connect_tx_id}</p>
          </div>
          <span className={`px-4 py-2 text-sm font-medium rounded-lg ${getStatusColor(dispute.status)}`}>
            {dispute.status}
          </span>
        </div>
      </div>

      {/* Dispute Info */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-sm text-gray-600">Amount</div>
            <div className="text-xl font-bold text-gray-900 mt-1">
              {formatCurrency(dispute.amount, dispute.currency)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Type</div>
            <div className="text-lg font-medium text-gray-900 mt-1">{dispute.dispute_type}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Reason</div>
            <div className="text-lg font-medium text-gray-900 mt-1">{dispute.reason}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Respond By</div>
            <div className="text-lg font-medium text-gray-900 mt-1">
              {dispute.respond_by
                ? new Date(dispute.respond_by).toLocaleDateString()
                : 'N/A'}
            </div>
          </div>
        </div>

        {dispute.customer_note && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Customer Note:</div>
            <div className="text-gray-900 bg-gray-50 p-3 rounded">{dispute.customer_note}</div>
          </div>
        )}

        {dispute.network_ref && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">Network Reference:</div>
            <div className="text-gray-900 font-mono mt-1">{dispute.network_ref}</div>
          </div>
        )}

        {dispute.outcome && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">Outcome:</div>
            <div className={`text-lg font-bold mt-1 ${dispute.outcome === 'won' ? 'text-green-600' : 'text-red-600'}`}>
              {dispute.outcome.toUpperCase()}
            </div>
            {dispute.resolved_at && (
              <div className="text-sm text-gray-600 mt-1">
                Resolved: {new Date(dispute.resolved_at).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {['open', 'evidence_submitted'].includes(dispute.status) && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
          <div className="flex gap-3">
            <button
              onClick={() => handleResolve('won')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Mark as Won
            </button>
            <button
              onClick={() => handleResolve('lost')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Mark as Lost
            </button>
          </div>
        </div>
      )}

      {/* Submit Evidence */}
      {dispute.status === 'open' && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Submit Evidence</h2>
          <textarea
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
            placeholder="Enter evidence details (tracking number, delivery confirmation, customer communication, etc.)"
          />
          <button
            onClick={handleSubmitEvidence}
            disabled={submitting || !evidenceText.trim()}
            className="mt-3 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Evidence'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="border-b border-gray-200">
          <div className="flex">
            {(['evidence', 'logs', 'fees'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === tab
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)} ({
                  tab === 'evidence' ? evidence.length :
                  tab === 'logs' ? logs.length :
                  fees.length
                })
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'evidence' && (
            <div className="space-y-4">
              {evidence.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No evidence submitted yet</div>
              ) : (
                evidence.map((ev) => (
                  <div key={ev.id} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-gray-900">{ev.evidence_type}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(ev.uploaded_at).toLocaleString()}
                      </div>
                    </div>
                    {ev.notes && <div className="text-gray-700 mb-2">{ev.notes}</div>}
                    {ev.file_name && (
                      <div className="text-sm text-blue-600">
                        📎 {ev.file_name}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">Uploaded by: {ev.uploaded_by}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-3">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No logs yet</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-gray-200 last:border-0">
                    <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-600"></div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div className="font-medium text-gray-900">{log.action}</div>
                        <div className="text-sm text-gray-500">
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">By: {log.actor}</div>
                      {log.details && (
                        <div className="text-sm text-gray-500 mt-1 font-mono">
                          {JSON.stringify(log.details, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'fees' && (
            <div>
              {fees.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No fees</div>
              ) : (
                <div className="space-y-3">
                  {fees.map((fee) => (
                    <div key={fee.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900">{fee.fee_type.replace('_', ' ').toUpperCase()}</div>
                        <div className={`text-sm mt-1 ${fee.status === 'charged' ? 'text-red-600' : 'text-gray-600'}`}>
                          Status: {fee.status}
                        </div>
                        {fee.charged_at && (
                          <div className="text-xs text-gray-500 mt-1">
                            Charged: {new Date(fee.charged_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        {formatCurrency(fee.amount, fee.currency)}
                      </div>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-gray-300 flex justify-between items-center">
                    <div className="font-bold text-gray-900">Total Fees</div>
                    <div className="text-xl font-bold text-red-600">
                      {formatCurrency(totalFees, dispute.currency)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}