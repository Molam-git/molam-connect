/**
 * BRIQUE 142-SIRA — Approval Request UI
 * Multi-signature approval workflow interface
 */

import React, { useEffect, useState } from 'react';

interface Signature {
  signer: string;
  roles: string[];
  signed_at: string;
  comment?: string;
}

interface ApprovalRequest {
  id: string;
  request_type: string;
  reference_id?: string;
  requested_by: string;
  requested_at: string;
  status: string;
  required_threshold: number;
  signatures: Signature[];
  metadata?: any;
}

interface ApprovalRequestProps {
  id: string;
}

export default function ApprovalRequest({ id }: ApprovalRequestProps) {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequest();
  }, [id]);

  async function loadRequest() {
    try {
      const resp = await fetch(`/api/approvals/${id}`);
      const data = await resp.json();
      setRequest(data);
    } catch (err) {
      console.error('Failed to load approval request:', err);
    } finally {
      setLoading(false);
    }
  }

  async function signRequest() {
    if (!confirm('Sign this approval request?')) return;

    try {
      await fetch(`/api/approvals/${id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });

      alert('✅ Signature added');
      setComment('');
      loadRequest();
    } catch (err) {
      console.error('Failed to sign:', err);
      alert('❌ Failed to sign approval request');
    }
  }

  async function rejectRequest() {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;

    try {
      await fetch(`/api/approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      alert('✅ Request rejected');
      loadRequest();
    } catch (err) {
      console.error('Failed to reject:', err);
      alert('❌ Failed to reject approval request');
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'open':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'expired':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  if (loading) {
    return <div className="p-6">Loading approval request...</div>;
  }

  if (!request) {
    return <div className="p-6">Approval request not found</div>;
  }

  const signatureCount = request.signatures?.filter((s) => s.signer).length || 0;
  const thresholdMet = signatureCount >= request.required_threshold;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Approval Request</h1>
          <p className="text-sm text-gray-600">Multi-signature approval workflow</p>
        </header>

        <div className="bg-white border rounded-lg p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-bold">{request.request_type}</h2>
              <div className="text-sm text-gray-600 mt-1">ID: {request.id}</div>
              {request.reference_id && (
                <div className="text-sm text-gray-600">Reference: {request.reference_id}</div>
              )}
            </div>
            <span className={`px-3 py-1 rounded text-sm font-medium ${getStatusColor(request.status)}`}>
              {request.status}
            </span>
          </div>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Signature Progress</span>
              <span className="text-sm">
                {signatureCount} / {request.required_threshold} required
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  thresholdMet ? 'bg-green-600' : 'bg-blue-600'
                }`}
                style={{
                  width: `${Math.min(100, (signatureCount / request.required_threshold) * 100)}%`,
                }}
              />
            </div>
            {thresholdMet && (
              <div className="text-green-700 text-sm mt-2 font-medium">
                ✓ Threshold met! Request will be auto-approved.
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="mb-6">
            <h3 className="font-semibold mb-3">Signatures ({signatureCount})</h3>

            {signatureCount > 0 ? (
              <div className="space-y-2">
                {request.signatures
                  .filter((s) => s.signer)
                  .map((sig, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 border rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{sig.signer}</div>
                          <div className="text-sm text-gray-600">
                            Roles: {sig.roles.join(', ')}
                          </div>
                          {sig.comment && (
                            <div className="text-sm text-gray-700 mt-1 italic">"{sig.comment}"</div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(sig.signed_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">No signatures yet</div>
            )}
          </div>

          {/* Action buttons */}
          {request.status === 'open' && (
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-3">Add Your Signature</h3>

              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">Comment (optional)</label>
                <textarea
                  className="w-full border px-3 py-2 rounded"
                  rows={2}
                  placeholder="Add a comment with your signature..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={signRequest}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Sign & Approve
                </button>
                <button
                  onClick={rejectRequest}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {/* Metadata */}
          {request.metadata && Object.keys(request.metadata).length > 0 && (
            <div className="border-t pt-6 mt-6">
              <h3 className="font-semibold mb-2">Metadata</h3>
              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                {JSON.stringify(request.metadata, null, 2)}
              </pre>
            </div>
          )}

          {/* Timeline */}
          <div className="border-t pt-6 mt-6">
            <h3 className="font-semibold mb-2">Timeline</h3>
            <div className="text-sm text-gray-600">
              <div>Requested: {new Date(request.requested_at).toLocaleString()}</div>
              <div>By: {request.requested_by}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Approval List component for browsing all approval requests
 */
export function ApprovalList() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequests();
  }, [filter]);

  async function loadRequests() {
    try {
      const params = filter ? `?status=${filter}` : '';
      const resp = await fetch(`/api/approvals${params}`);
      const data = await resp.json();
      setRequests(data);
    } catch (err) {
      console.error('Failed to load approval requests:', err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'open':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  if (loading) {
    return <div className="p-6">Loading approval requests...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Approval Requests</h1>
        <p className="text-sm text-gray-600">Multi-signature approval workflow</p>
      </header>

      {/* Filter */}
      <div className="mb-6 bg-white border rounded-lg p-4">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('open')}
            className={`px-4 py-2 rounded ${
              filter === 'open' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            Open
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

      {/* List */}
      <div className="space-y-3">
        {requests.map((req) => (
          <div key={req.id} className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{req.request_type}</h3>
                <div className="text-sm text-gray-600 mt-1">
                  Signatures: {req.signature_count || 0} / {req.required_threshold}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(req.requested_at).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded ${getStatusColor(req.status)}`}>
                  {req.status}
                </span>
                <a
                  href={`/ops/approvals/${req.id}`}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  View
                </a>
              </div>
            </div>
          </div>
        ))}

        {requests.length === 0 && (
          <div className="text-center py-12 text-gray-500">No approval requests</div>
        )}
      </div>
    </div>
  );
}
