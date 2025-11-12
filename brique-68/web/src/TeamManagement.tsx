/**
 * Team Management Component
 * Apple-inspired clean design for managing team members and roles
 */
import React, { useEffect, useState } from 'react';

interface TeamMember {
  user_id: string;
  email: string;
  name: string;
  roles: Array<{
    id: string;
    name: string;
    template_name: string;
    assigned_at: string;
    expires_at?: string;
  }>;
  last_active?: string;
}

interface Props {
  organisationId: string;
}

export default function TeamManagement({ organisationId }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    fetchTeamMembers();
  }, [organisationId]);

  const fetchTeamMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/rbac/organisations/${organisationId}/team`);
      const data = await response.json();
      setMembers(data.members || []);
    } catch (err) {
      console.error('Error fetching team:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading team members...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Team</h1>
          <p className="text-gray-500 mt-1">
            Manage team members and their access permissions
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-medium"
        >
          + Invite Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="text-gray-500 text-sm font-medium">Total Members</div>
          <div className="text-3xl font-semibold mt-2">{members.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="text-gray-500 text-sm font-medium">Active Today</div>
          <div className="text-3xl font-semibold mt-2">
            {members.filter((m) => isActiveToday(m.last_active)).length}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="text-gray-500 text-sm font-medium">Pending Invites</div>
          <div className="text-3xl font-semibold mt-2">0</div>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Member
                </th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Roles
                </th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Last Active
                </th>
                <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {members.map((member) => (
                <tr
                  key={member.user_id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                        {member.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="ml-4">
                        <div className="font-medium text-gray-900">{member.name}</div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {member.roles.map((role) => (
                        <span
                          key={role.id}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {role.template_name || role.name}
                          {role.expires_at && (
                            <span className="ml-1 text-blue-600">⏱</span>
                          )}
                        </span>
                      ))}
                      {member.roles.length === 0 && (
                        <span className="text-sm text-gray-400">No roles assigned</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {member.last_active
                      ? formatRelativeTime(member.last_active)
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-600 hover:text-blue-800 font-medium text-sm mr-4">
                      Edit
                    </button>
                    <button className="text-red-600 hover:text-red-800 font-medium text-sm">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {members.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg">No team members yet</div>
            <button
              onClick={() => setShowInvite(true)}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
            >
              Invite Your First Member
            </button>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal
          organisationId={organisationId}
          onClose={() => setShowInvite(false)}
          onSuccess={fetchTeamMembers}
        />
      )}
    </div>
  );
}

/**
 * Invite Member Modal
 */
function InviteModal({
  organisationId,
  onClose,
  onSuccess,
}: {
  organisationId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    const response = await fetch(`/api/rbac/organisations/${organisationId}/roles`);
    const data = await response.json();
    setRoles(data.roles || []);
  };

  const handleInvite = async () => {
    if (!email || !roleId) return;

    setLoading(true);
    try {
      // In production, this would create a user account and assign role
      await fetch(`/api/rbac/roles/${roleId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_email: email }),
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error inviting member:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-semibold mb-6">Invite Team Member</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="colleague@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role
            </label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a role...</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.template_name || role.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleInvite}
            disabled={loading || !email || !roleId}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function isActiveToday(lastActive?: string): boolean {
  if (!lastActive) return false;
  const lastActiveDate = new Date(lastActive);
  const today = new Date();
  return lastActiveDate.toDateString() === today.toDateString();
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}