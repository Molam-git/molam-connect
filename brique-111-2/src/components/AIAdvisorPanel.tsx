/**
 * Brique 111-2: AI Config Advisor - Operations UI Panel
 * React component for managing SIRA configuration recommendations
 */

import React, { useState, useEffect } from 'react';

interface Recommendation {
  id: string;
  merchant_id?: string;
  target_type: string;
  target_id?: string;
  action: string;
  params: any;
  evidence: any;
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'proposed' | 'approved' | 'applied' | 'rejected' | 'rolled_back';
  created_by: string;
  created_at: string;
  updated_at: string;
  approval_count?: number;
  requires_multisig?: boolean;
  can_auto_apply?: boolean;
}

interface Stats {
  total: number;
  by_status: { [key: string]: number };
  by_priority: { [key: string]: number };
  avg_confidence: number;
}

interface AuditEntry {
  id: string;
  recommendation_id: string;
  actor: string;
  action_taken: string;
  details: any;
  created_at: string;
}

interface ApprovalStatus {
  recommendation_id: string;
  status: string;
  approvals: number;
  rejections: number;
  required_signatures: number;
  approver_roles: string[];
  approval_list: Array<{
    approver_id: string;
    decision: string;
    comment: string;
    created_at: string;
  }>;
}

export default function AIAdvisorPanel() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState({
    status: '',
    priority: '',
    targetType: ''
  });
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [evidence, setEvidence] = useState<any>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRecommendations();
    loadStats();
  }, [filter]);

  async function loadRecommendations() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.priority) params.append('priority', filter.priority);
      if (filter.targetType) params.append('targetType', filter.targetType);

      const res = await fetch(`/api/ai-recommendations?${params.toString()}`);
      const data = await res.json();
      setRecommendations(data);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
      alert('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/ai-recommendations/stats/metrics');
      const data = await res.json();

      // Aggregate stats
      const stats: Stats = {
        total: 0,
        by_status: {},
        by_priority: {},
        avg_confidence: 0
      };

      // This would need proper aggregation from the metrics
      setStats(stats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function approve(id: string, decision: 'approve' | 'reject' = 'approve') {
    const comment = prompt(decision === 'approve' ? 'Add approval comment (optional):' : 'Reason for rejection:');

    if (decision === 'reject' && !comment) {
      alert('Rejection reason is required');
      return;
    }

    try {
      const res = await fetch(`/api/ai-recommendations/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment })
      });

      if (res.ok) {
        const result = await res.json();

        if (result.status === 'approved') {
          alert(`Recommendation approved! (${result.approvals}/${result.required} signatures)`);
        } else if (result.status === 'pending') {
          alert(`Approval recorded. Still need ${result.required - result.approvals} more signature(s).`);
        } else if (result.status === 'rejected') {
          alert('Recommendation rejected');
        }

        loadRecommendations();
      } else {
        const error = await res.json();
        alert(`Failed: ${error.message || error.error}`);
      }
    } catch (error) {
      console.error('Approval error:', error);
      alert('Failed to process approval');
    }
  }

  async function apply(id: string) {
    if (!confirm('Are you sure you want to apply this recommendation? This will modify the configuration.')) {
      return;
    }

    try {
      const res = await fetch(`/api/ai-recommendations/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await res.json();

      if (result.ok) {
        alert('Recommendation applied successfully');
        loadRecommendations();
      } else {
        alert(`Failed to apply: ${result.details || result.error}`);
      }
    } catch (error) {
      console.error('Apply error:', error);
      alert('Failed to apply recommendation');
    }
  }

  async function rollback(id: string) {
    const reason = prompt('Reason for rollback:');
    if (!reason) return;

    try {
      const res = await fetch(`/api/ai-recommendations/${id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      if (res.ok) {
        alert('Recommendation rolled back successfully');
        loadRecommendations();
      } else {
        const error = await res.json();
        alert(`Failed to rollback: ${error.message || error.error}`);
      }
    } catch (error) {
      console.error('Rollback error:', error);
      alert('Failed to rollback recommendation');
    }
  }

  async function reject(id: string) {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;

    try {
      const res = await fetch(`/api/ai-recommendations/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      if (res.ok) {
        alert('Recommendation rejected');
        loadRecommendations();
      } else {
        const error = await res.json();
        alert(`Failed to reject: ${error.message || error.error}`);
      }
    } catch (error) {
      console.error('Reject error:', error);
      alert('Failed to reject recommendation');
    }
  }

  async function viewDetails(rec: Recommendation) {
    setSelectedRec(rec);

    // Load evidence
    try {
      const evidenceRes = await fetch(`/api/ai-recommendations/${rec.id}/evidence`);
      const evidenceData = await evidenceRes.json();
      setEvidence(evidenceData);
    } catch (error) {
      console.error('Failed to load evidence:', error);
    }

    // Load audit trail
    try {
      const auditRes = await fetch(`/api/ai-recommendations/${rec.id}/audit`);
      const auditData = await auditRes.json();
      setAuditTrail(auditData);
    } catch (error) {
      console.error('Failed to load audit trail:', error);
    }

    // Load approval status
    try {
      const approvalRes = await fetch(`/api/ai-recommendations/${rec.id}/approvals`);
      const approvalData = await approvalRes.json();
      setApprovalStatus(approvalData);
    } catch (error) {
      console.error('Failed to load approvals:', error);
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'applied': return 'bg-green-100 text-green-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'proposed': return 'bg-yellow-100 text-yellow-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'rolled_back': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">SIRA Config Recommendations</h1>
          <p className="text-gray-600 mt-2">
            AI-powered configuration recommendations based on telemetry and performance data
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filter.status}
                onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">All</option>
                <option value="proposed">Proposed</option>
                <option value="awaiting_approvals">Awaiting Approvals</option>
                <option value="approved">Approved</option>
                <option value="applied">Applied</option>
                <option value="rejected">Rejected</option>
                <option value="rolled_back">Rolled Back</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={filter.priority}
                onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Type</label>
              <select
                value={filter.targetType}
                onChange={(e) => setFilter({ ...filter, targetType: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">All</option>
                <option value="plugin">Plugin</option>
                <option value="webhook">Webhook</option>
                <option value="checkout">Checkout</option>
                <option value="treasury">Treasury</option>
                <option value="merchant_setting">Merchant Setting</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={loadRecommendations}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Recommendations List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="text-gray-500">Loading recommendations...</div>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-gray-500">No recommendations found</div>
            </div>
          ) : (
            recommendations.map((rec) => (
              <div
                key={rec.id}
                className={`bg-white rounded-lg shadow p-4 border-l-4 ${getPriorityColor(rec.priority)}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(rec.status)}`}>
                        {rec.status.toUpperCase()}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold border ${getPriorityColor(rec.priority)}`}>
                        {rec.priority.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-600">
                        {rec.target_type} • {rec.action}
                      </span>
                      <span className="text-sm font-medium text-gray-700">
                        Confidence: {(rec.confidence * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="mb-3">
                      <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
                        {JSON.stringify(rec.params, null, 2)}
                      </pre>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>Created: {new Date(rec.created_at).toLocaleString()}</span>
                      {rec.approval_count !== undefined && (
                        <span>• Approvals: {rec.approval_count}</span>
                      )}
                      {rec.requires_multisig && (
                        <span className="text-orange-600">• Requires Multi-Sig</span>
                      )}
                      {rec.can_auto_apply && (
                        <span className="text-green-600">• Can Auto-Apply</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    {(['proposed', 'awaiting_approvals'].includes(rec.status)) && (
                      <>
                        <button
                          onClick={() => approve(rec.id, 'approve')}
                          className="px-4 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => approve(rec.id, 'reject')}
                          className="px-4 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {rec.status === 'approved' && (
                      <button
                        onClick={() => apply(rec.id)}
                        className="px-4 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Apply
                      </button>
                    )}

                    {rec.status === 'applied' && (
                      <button
                        onClick={() => rollback(rec.id)}
                        className="px-4 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                      >
                        Rollback
                      </button>
                    )}

                    <button
                      onClick={() => viewDetails(rec)}
                      className="px-4 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Details Modal */}
        {selectedRec && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-2xl font-bold">Recommendation Details</h2>
                  <button
                    onClick={() => setSelectedRec(null)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Basic Info */}
                  <div>
                    <h3 className="font-semibold mb-2">Basic Information</h3>
                    <div className="bg-gray-50 p-3 rounded">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><strong>ID:</strong> {selectedRec.id}</div>
                        <div><strong>Status:</strong> {selectedRec.status}</div>
                        <div><strong>Priority:</strong> {selectedRec.priority}</div>
                        <div><strong>Confidence:</strong> {(selectedRec.confidence * 100).toFixed(2)}%</div>
                        <div><strong>Target Type:</strong> {selectedRec.target_type}</div>
                        <div><strong>Action:</strong> {selectedRec.action}</div>
                        <div><strong>Created By:</strong> {selectedRec.created_by}</div>
                        <div><strong>Created At:</strong> {new Date(selectedRec.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  {/* Evidence */}
                  {evidence && (
                    <div>
                      <h3 className="font-semibold mb-2">Evidence</h3>
                      <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                        {JSON.stringify(evidence, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Approval Status */}
                  {approvalStatus && (
                    <div>
                      <h3 className="font-semibold mb-2">Approvals & Signatures</h3>
                      <div className="bg-gray-50 p-3 rounded">
                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div><strong>Status:</strong> {approvalStatus.status}</div>
                          <div><strong>Approvals:</strong> {approvalStatus.approvals}/{approvalStatus.required_signatures}</div>
                          <div><strong>Rejections:</strong> {approvalStatus.rejections}</div>
                          <div><strong>Required Roles:</strong> {approvalStatus.approver_roles.join(', ')}</div>
                        </div>

                        {approvalStatus.approval_list.length > 0 && (
                          <div className="space-y-2 mt-3">
                            <div className="font-semibold text-sm">Signature History:</div>
                            {approvalStatus.approval_list.map((approval, idx) => (
                              <div
                                key={idx}
                                className={`p-2 rounded text-sm ${
                                  approval.decision === 'approve'
                                    ? 'bg-green-50 border border-green-200'
                                    : 'bg-red-50 border border-red-200'
                                }`}
                              >
                                <div className="flex justify-between">
                                  <span>
                                    <strong>{approval.decision === 'approve' ? '✓' : '✗'}</strong> {approval.approver_id}
                                  </span>
                                  <span className="text-gray-500">{new Date(approval.created_at).toLocaleString()}</span>
                                </div>
                                {approval.comment && (
                                  <div className="mt-1 text-xs text-gray-600">{approval.comment}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Audit Trail */}
                  {auditTrail.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">Audit Trail</h3>
                      <div className="space-y-2">
                        {auditTrail.map((entry) => (
                          <div key={entry.id} className="bg-gray-50 p-3 rounded text-sm">
                            <div className="flex justify-between">
                              <span><strong>{entry.action_taken}</strong> by {entry.actor}</span>
                              <span className="text-gray-500">{new Date(entry.created_at).toLocaleString()}</span>
                            </div>
                            {entry.details && (
                              <pre className="mt-2 text-xs text-gray-600">
                                {JSON.stringify(entry.details, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
