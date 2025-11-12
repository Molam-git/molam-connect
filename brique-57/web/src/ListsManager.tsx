import React, { useState, useEffect } from 'react';

interface ListEntry {
  id: string;
  merchant_id: string;
  list_type: 'whitelist' | 'blacklist';
  entity_type: 'customer' | 'card' | 'ip' | 'device';
  value: string;
  scope: any;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

const ListsManager: React.FC = () => {
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<ListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'whitelist' | 'blacklist'>('whitelist');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all');

  // Add entry form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEntry, setNewEntry] = useState({
    list_type: 'whitelist' as 'whitelist' | 'blacklist',
    entity_type: 'customer' as 'customer' | 'card' | 'ip' | 'device',
    value: '',
    reason: '',
  });

  // Bulk import
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);

  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    filterEntries();
  }, [entries, selectedTab, selectedEntityType]);

  const loadEntries = async () => {
    try {
      const res = await fetch('/api/merchant-protection/lists', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setEntries(data);
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterEntries = () => {
    let filtered = entries.filter((e) => e.list_type === selectedTab);
    if (selectedEntityType !== 'all') {
      filtered = filtered.filter((e) => e.entity_type === selectedEntityType);
    }
    setFilteredEntries(filtered);
  };

  const addEntry = async () => {
    if (!newEntry.value.trim()) {
      alert('Please enter a value');
      return;
    }

    try {
      const res = await fetch('/api/merchant-protection/lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(newEntry),
      });

      if (res.ok) {
        await loadEntries();
        setShowAddForm(false);
        setNewEntry({
          list_type: 'whitelist',
          entity_type: 'customer',
          value: '',
          reason: '',
        });
      } else {
        alert('Failed to add entry');
      }
    } catch (error) {
      console.error('Error adding entry:', error);
      alert('Failed to add entry');
    }
  };

  const removeEntry = async (entry: ListEntry) => {
    if (!confirm(`Remove ${entry.value} from ${entry.list_type}?`)) return;

    try {
      const res = await fetch('/api/merchant-protection/lists', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          list_type: entry.list_type,
          entity_type: entry.entity_type,
          value: entry.value,
        }),
      });

      if (res.ok) {
        await loadEntries();
      } else {
        alert('Failed to remove entry');
      }
    } catch (error) {
      console.error('Error removing entry:', error);
      alert('Failed to remove entry');
    }
  };

  const bulkImport = async () => {
    if (!bulkFile) {
      alert('Please select a CSV file');
      return;
    }

    const formData = new FormData();
    formData.append('file', bulkFile);
    formData.append('list_type', selectedTab);
    formData.append('entity_type', selectedEntityType === 'all' ? 'customer' : selectedEntityType);

    try {
      const res = await fetch('/api/merchant-protection/lists/bulk-import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        alert(`Imported ${result.imported} entries, ${result.failed} failed`);
        await loadEntries();
        setShowBulkImport(false);
        setBulkFile(null);
      } else {
        alert('Failed to import entries');
      }
    } catch (error) {
      console.error('Error importing entries:', error);
      alert('Failed to import entries');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading lists...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Whitelist & Blacklist</h1>
          <p className="text-gray-600 mt-1">Manage trusted and blocked entities</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulkImport(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Bulk Import
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Entry
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setSelectedTab('whitelist')}
          className={`px-4 py-2 font-medium ${
            selectedTab === 'whitelist'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Whitelist ({entries.filter((e) => e.list_type === 'whitelist').length})
        </button>
        <button
          onClick={() => setSelectedTab('blacklist')}
          className={`px-4 py-2 font-medium ${
            selectedTab === 'blacklist'
              ? 'text-red-600 border-b-2 border-red-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Blacklist ({entries.filter((e) => e.list_type === 'blacklist').length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={selectedEntityType}
          onChange={(e) => setSelectedEntityType(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="all">All Types</option>
          <option value="customer">Customers</option>
          <option value="card">Cards</option>
          <option value="ip">IP Addresses</option>
          <option value="device">Devices</option>
        </select>
      </div>

      {/* List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Added</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No entries found
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 rounded">
                      {entry.entity_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    {entry.value}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{entry.reason || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => removeEntry(entry)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Entry Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Entry</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">List Type</label>
                <select
                  value={newEntry.list_type}
                  onChange={(e) => setNewEntry({ ...newEntry, list_type: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="whitelist">Whitelist</option>
                  <option value="blacklist">Blacklist</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
                <select
                  value={newEntry.entity_type}
                  onChange={(e) => setNewEntry({ ...newEntry, entity_type: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="customer">Customer ID</option>
                  <option value="card">Card Fingerprint</option>
                  <option value="ip">IP Address</option>
                  <option value="device">Device Fingerprint</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                <input
                  type="text"
                  value={newEntry.value}
                  onChange={(e) => setNewEntry({ ...newEntry, value: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Enter value..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={newEntry.reason}
                  onChange={(e) => setNewEntry({ ...newEntry, reason: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Enter reason..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={addEntry}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Bulk Import</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border rounded"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Format: value,reason (one entry per line, header row required)
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowBulkImport(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={bulkImport}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListsManager;
