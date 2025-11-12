/**
 * Approvals Queue Component
 * Multi-signature approval workflow for sensitive role assignments
 */
import React, { useEffect, useState } from 'react';

interface RoleRequest {
  id: string;
  role_id: string;
  role_name: string;
  role_sensitive: boolean;
  target_user_id: string;
  target_user_email?: string;
  requested_by: string;
  requester_email?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approvals: Array<{
    by: string;
    at: string;
    note: string;
  }>;
  required_approvals: number;
  reason?: string;
  organisation_name?: string;
  created_at: string;
  updated_at: string;
}

export default function ApprovalsQueue() {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const url =
        filter === 'pending'
          ? '/api/rbac/requests?status=pending'
          : '/api/rbac/requests';
      const response = await fetch(url);
      const data = await response.json();
      setRequests(data.requests || []);
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string, note: string) => {
    try {
      await fetch(`/api/rbac/requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      fetchRequests();
    } catch (err) {
      console.error('Error approving request:', err);
    }
  };

  const handleReject = async (requestId: string, reason: string) => {
    try {
      await fetch(`/api/rbac/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      fetchRequests();
    } catch (err) {
      console.error('Error rejecting request:', err);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading approval requests...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">
            Approval Requests
          </h1>
          <p className="text-gray-500 mt-1">
            Review and approve role assignment requests
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              filter === 'pending'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            onApprove={(note) => handleApprove(request.id, note)}
            onReject={(reason) => handleReject(request.id, reason)}
          />
        ))}

        {requests.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <div className="text-gray-400 text-lg">
              {filter === 'pending'
                ? 'No pending approval requests'
                : 'No approval requests'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Request Card Component
 */
function RequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: RoleRequest;
  onApprove: (note: string) => void;
  onReject: (reason: string) => void;
}) {
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const progressPercent =
    (request.approvals.length / request.required_approvals) * 100;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                request.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-800'
                  : request.status === 'approved'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {request.status}
            </span>
            {request.role_sensitive && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                🔐 Sensitive
              </span>
            )}
          </div>

          {/* Details */}
          <div className="space-y-2">
            <div>
              <span className="font-semibold text-gray-900">Role:</span>{' '}
              <span className="text-gray-700">{request.role_name}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-900">For:</span>{' '}
              <span className="text-gray-700">
                {request.target_user_email || request.target_user_id}
              </span>
            </div>
            <div>
              <span className="font-semibold text-gray-900">Requested by:</span>{' '}
              <span className="text-gray-700">
                {request.requester_email || request.requested_by}
              </span>
            </div>
            {request.organisation_name && (
              <div>
                <span className="font-semibold text-gray-900">Organisation:</span>{' '}
                <span className="text-gray-700">{request.organisation_name}</span>
              </div>
            )}
            {request.reason && (
              <div>
                <span className="font-semibold text-gray-900">Reason:</span>{' '}
                <span className="text-gray-700">{request.reason}</span>
              </div>
            )}
            <div className="text-sm text-gray-500">
              Requested {formatRelativeTime(request.created_at)}
            </div>
          </div>

          {/* Approvals Progress */}
          {request.status === 'pending' && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium text-gray-700">
                  Approvals: {request.approvals.length} / {request.required_approvals}
                </span>
                <span className="text-gray-500">{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-2 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Approvals List */}
          {request.approvals.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-sm font-medium text-gray-700">Approvals:</div>
              {request.approvals.map((approval, index) => (
                <div
                  key={index}
                  className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2"
                >
                  ✓ Approved by {approval.by} on{' '}
                  {new Date(approval.at).toLocaleString()}
                  {approval.note && (
                    <div className="text-xs text-gray-500 mt-1">
                      Note: {approval.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {request.status === 'pending' && (
          <div className="flex gap-2 ml-4">
            <button
              onClick={() => setShowApproveModal(true)}
              className="px-4 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors font-medium"
            >
              Approve
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <ApprovalModal
          title="Approve Request"
          onConfirm={(note) => {
            onApprove(note);
            setShowApproveModal(false);
          }}
          onCancel={() => setShowApproveModal(false)}
        />
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <ApprovalModal
          title="Reject Request"
          onConfirm={(reason) => {
            onReject(reason);
            setShowRejectModal(false);
          }}
          onCancel={() => setShowRejectModal(false)}
          isReject
        />
      )}
    </div>
  );
}

/**
 * Approval/Rejection Modal
 */
function ApprovalModal({
  title,
  onConfirm,
  onCancel,
  isReject = false,
}: {
  title: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
  isReject?: boolean;
}) {
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-semibold mb-6">{title}</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {isReject ? 'Reason for rejection' : 'Approval note (optional)'}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
            placeholder={
              isReject
                ? 'Explain why this request is being rejected...'
                : 'Add an optional note...'
            }
          />
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note)}
            disabled={isReject && !note}
            className={`flex-1 px-4 py-2 text-white rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              isReject
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {isReject ? 'Reject' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper function
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}