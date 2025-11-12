/**
 * Role Editor Component
 * Create and edit role templates with permission selection
 */
import React, { useEffect, useState } from 'react';

interface Permission {
  id: string;
  code: string;
  name: string;
  description: string;
  resource_kind: string;
  actions: string[];
}

interface RoleTemplate {
  id?: string;
  name: string;
  description: string;
  permissions: string[]; // permission IDs
  sensitive: boolean;
}

export default function RoleEditor({
  templateId,
  onSave,
  onCancel,
}: {
  templateId?: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [template, setTemplate] = useState<RoleTemplate>({
    name: '',
    description: '',
    permissions: [],
    sensitive: false,
  });
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPermissions();
    if (templateId) {
      fetchTemplate(templateId);
    }
  }, [templateId]);

  const fetchPermissions = async () => {
    try {
      const response = await fetch('/api/rbac/permissions');
      const data = await response.json();
      setAllPermissions(data.permissions || []);
    } catch (err) {
      console.error('Error fetching permissions:', err);
    }
  };

  const fetchTemplate = async (id: string) => {
    try {
      const response = await fetch(`/api/rbac/templates/${id}`);
      const data = await response.json();
      setTemplate(data.template);
    } catch (err) {
      console.error('Error fetching template:', err);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const url = templateId
        ? `/api/rbac/templates/${templateId}`
        : '/api/rbac/templates';
      const method = templateId ? 'PUT' : 'POST';

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });

      onSave();
    } catch (err) {
      console.error('Error saving template:', err);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (permissionId: string) => {
    setTemplate((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter((id) => id !== permissionId)
        : [...prev.permissions, permissionId],
    }));
  };

  const selectAllInCategory = (resourceKind: string) => {
    const categoryPerms = allPermissions
      .filter((p) => p.resource_kind === resourceKind)
      .map((p) => p.id);

    const allSelected = categoryPerms.every((id) =>
      template.permissions.includes(id)
    );

    setTemplate((prev) => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter((id) => !categoryPerms.includes(id))
        : [...new Set([...prev.permissions, ...categoryPerms])],
    }));
  };

  // Group permissions by resource kind
  const groupedPermissions = allPermissions.reduce((acc, perm) => {
    const category = perm.resource_kind || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  // Filter by search
  const filteredCategories = Object.entries(groupedPermissions).reduce(
    (acc, [category, perms]) => {
      const filtered = perms.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.code.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filtered.length > 0) {
        acc[category] = filtered;
      }
      return acc;
    },
    {} as Record<string, Permission[]>
  );

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-white border border-gray-200 rounded-2xl p-8">
        {/* Header */}
        <h2 className="text-2xl font-semibold mb-6">
          {templateId ? 'Edit Role Template' : 'Create Role Template'}
        </h2>

        {/* Basic Info */}
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role Name
            </label>
            <input
              type="text"
              value={template.name}
              onChange={(e) =>
                setTemplate({ ...template, name: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Finance Manager"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={template.description}
              onChange={(e) =>
                setTemplate({ ...template, description: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Brief description of this role..."
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="sensitive"
              checked={template.sensitive}
              onChange={(e) =>
                setTemplate({ ...template, sensitive: e.target.checked })
              }
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label
              htmlFor="sensitive"
              className="ml-2 text-sm font-medium text-gray-700"
            >
              Sensitive role (requires multi-signature approval to assign)
            </label>
          </div>
        </div>

        {/* Permissions Selection */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Permissions</h3>
            <div className="text-sm text-gray-500">
              {template.permissions.length} selected
            </div>
          </div>

          {/* Search */}
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search permissions..."
            className="w-full px-4 py-2 border border-gray-300 rounded-xl mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />

          {/* Permission Categories */}
          <div className="space-y-4 max-h-96 overflow-y-auto border border-gray-200 rounded-xl p-4">
            {Object.entries(filteredCategories).map(([category, perms]) => {
              const allSelected = perms.every((p) =>
                template.permissions.includes(p.id)
              );

              return (
                <div key={category} className="border-b border-gray-100 pb-4 last:border-0">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900 capitalize">
                      {category}
                    </h4>
                    <button
                      onClick={() => selectAllInCategory(category)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {perms.map((perm) => (
                      <label
                        key={perm.id}
                        className="flex items-start hover:bg-gray-50 p-2 rounded-lg cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={template.permissions.includes(perm.id)}
                          onChange={() => togglePermission(perm.id)}
                          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="ml-3 flex-1">
                          <div className="font-medium text-gray-900 text-sm">
                            {perm.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {perm.code}
                          </div>
                          {perm.description && (
                            <div className="text-xs text-gray-400 mt-1">
                              {perm.description}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            {Object.keys(filteredCategories).length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No permissions found
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !template.name || template.permissions.length === 0}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : templateId ? 'Update Role' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}