// =====================================================
// Brique 74 - Developer Portal UI Components
// =====================================================
// Purpose: React components for developer portal interface
// Version: 1.0.0
// Stack: React 18+ with TypeScript, TailwindCSS
// =====================================================

import React, { useState, useEffect } from 'react';
import axios from 'axios';

// =====================================================
// API CLIENT
// =====================================================

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3073';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('molam_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // For development
  config.headers['X-User-Id'] = localStorage.getItem('user_id') || 'dev-user-1';
  config.headers['X-Tenant-Id'] = localStorage.getItem('tenant_id') || 'dev-tenant-1';
  config.headers['X-Tenant-Type'] = localStorage.getItem('tenant_type') || 'merchant';
  return config;
});

// =====================================================
// 1. API KEY MANAGER COMPONENT
// =====================================================

interface APIKey {
  id: string;
  name: string;
  key_prefix: string;
  environment: 'test' | 'production';
  status: string;
  scopes: string[];
  created_at: string;
  last_used_at?: string;
  rate_limit_per_second: number;
}

export const APIKeyManager: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyData, setNewKeyData] = useState<any>(null);

  useEffect(() => {
    loadAPIKeys();
  }, []);

  const loadAPIKeys = async () => {
    try {
      const response = await apiClient.get('/dev/api-keys');
      setApiKeys(response.data.api_keys);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const createAPIKey = async (formData: any) => {
    try {
      const response = await apiClient.post('/dev/api-keys', formData);
      setNewKeyData(response.data.api_key);
      await loadAPIKeys();
    } catch (error) {
      console.error('Failed to create API key:', error);
      alert('Failed to create API key');
    }
  };

  const revokeAPIKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await apiClient.delete(`/dev/api-keys/${keyId}`, {
        data: { reason: 'Revoked by user' },
      });
      await loadAPIKeys();
    } catch (error) {
      console.error('Failed to revoke API key:', error);
      alert('Failed to revoke API key');
    }
  };

  if (loading) {
    return <div className="p-8">Loading API keys...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-600 mt-2">Manage your API keys and access credentials</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
        >
          + Create New Key
        </button>
      </div>

      {/* API Keys List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Environment</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scopes</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {apiKeys.map((key) => (
              <tr key={key.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{key.name}</div>
                  <div className="text-xs text-gray-500">Created {new Date(key.created_at).toLocaleDateString()}</div>
                </td>
                <td className="px-6 py-4">
                  <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">{key.key_prefix}...</code>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      key.environment === 'production'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {key.environment}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {key.scopes.slice(0, 2).map((scope) => (
                      <span key={scope} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                        {scope}
                      </span>
                    ))}
                    {key.scopes.length > 2 && (
                      <span className="text-gray-500 text-xs">+{key.scopes.length - 2}</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      key.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {key.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}
                </td>
                <td className="px-6 py-4 text-right">
                  {key.status === 'active' && (
                    <button
                      onClick={() => revokeAPIKey(key.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <CreateAPIKeyModal
          onClose={() => {
            setShowCreateModal(false);
            setNewKeyData(null);
          }}
          onCreate={createAPIKey}
          newKeyData={newKeyData}
        />
      )}
    </div>
  );
};

// Create API Key Modal Component
const CreateAPIKeyModal: React.FC<{
  onClose: () => void;
  onCreate: (data: any) => void;
  newKeyData: any;
}> = ({ onClose, onCreate, newKeyData }) => {
  const [formData, setFormData] = useState({
    name: '',
    environment: 'test',
    scopes: ['read'],
    expires_in_days: 365,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(formData);
  };

  if (newKeyData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
          <h2 className="text-2xl font-bold mb-4 text-green-600">✓ API Key Created</h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
            <p className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Save this key securely</p>
            <p className="text-sm text-yellow-700">This is the only time you'll see the full key.</p>
          </div>
          <div className="bg-gray-50 p-4 rounded mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Secret Key</label>
            <code className="block bg-white p-3 rounded border font-mono text-sm break-all">
              {newKeyData.secret_key}
            </code>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
        <h2 className="text-2xl font-bold mb-6">Create API Key</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Key Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="Production API Key"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Environment</label>
            <select
              value={formData.environment}
              onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="test">Test</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Scopes</label>
            <div className="grid grid-cols-2 gap-2">
              {['read', 'write', 'webhooks:write', 'payments:read', 'payments:refund'].map((scope) => (
                <label key={scope} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.scopes.includes(scope)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, scopes: [...formData.scopes, scope] });
                      } else {
                        setFormData({ ...formData, scopes: formData.scopes.filter((s) => s !== scope) });
                      }
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm">{scope}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              Create Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =====================================================
// 2. PLAYGROUND COMPONENT
// =====================================================

interface PlaygroundRequest {
  id: string;
  method: string;
  endpoint: string;
  status_code?: number;
  response_time_ms?: number;
  executed_at: string;
}

export const Playground: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [method, setMethod] = useState('GET');
  const [endpoint, setEndpoint] = useState('/v1/payments');
  const [requestBody, setRequestBody] = useState('{\n  \n}');
  const [requestHeaders, setRequestHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<PlaygroundRequest[]>([]);

  useEffect(() => {
    createSession();
  }, []);

  const createSession = async () => {
    try {
      const response = await apiClient.post('/dev/playground/sessions', {
        name: 'Quick Test',
        environment: 'sandbox',
      });
      setSessionId(response.data.session.id);
      loadHistory(response.data.session.id);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const loadHistory = async (sid: string) => {
    try {
      const response = await apiClient.get(`/dev/playground/sessions/${sid}/history`);
      setHistory(response.data.history);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const executeRequest = async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const response = await apiClient.post(`/dev/playground/sessions/${sessionId}/execute`, {
        method,
        endpoint,
        headers: JSON.parse(requestHeaders),
        body: method !== 'GET' ? JSON.parse(requestBody) : undefined,
      });

      setResponse(response.data.request);
      loadHistory(sessionId);
    } catch (error: any) {
      setResponse({
        error: true,
        message: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">API Playground</h1>
        <p className="text-gray-600 mt-2">Test API endpoints in a safe sandbox environment</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Request Panel */}
        <div className="col-span-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Request</h2>

          {/* Method & Endpoint */}
          <div className="flex gap-3 mb-4">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 font-mono"
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
              <option>PATCH</option>
            </select>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="flex-1 border border-gray-300 rounded px-3 py-2 font-mono"
              placeholder="/v1/endpoint"
            />
            <button
              onClick={executeRequest}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>

          {/* Headers */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Headers</label>
            <textarea
              value={requestHeaders}
              onChange={(e) => setRequestHeaders(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm h-24"
            />
          </div>

          {/* Body (if not GET) */}
          {method !== 'GET' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Request Body</label>
              <textarea
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm h-48"
              />
            </div>
          )}

          {/* Response */}
          {response && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold">Response</h3>
                {response.status_code && (
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      response.status_code < 300
                        ? 'bg-green-100 text-green-800'
                        : response.status_code < 400
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {response.status_code} - {response.response_time_ms}ms
                  </span>
                )}
              </div>
              <pre className="bg-gray-50 border border-gray-200 rounded p-4 overflow-auto max-h-96 text-sm font-mono">
                {JSON.stringify(response.response_body, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* History Sidebar */}
        <div className="col-span-4 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">History</h2>
          <div className="space-y-2">
            {history.map((req) => (
              <div
                key={req.id}
                className="border border-gray-200 rounded p-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setMethod(req.method);
                  setEndpoint(req.endpoint);
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-semibold">{req.method}</span>
                  {req.status_code && (
                    <span
                      className={`text-xs font-semibold ${
                        req.status_code < 300 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {req.status_code}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 truncate">{req.endpoint}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(req.executed_at).toLocaleTimeString()}
                  {req.response_time_ms && ` • ${req.response_time_ms}ms`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// 3. LIVE LOGS COMPONENT
// =====================================================

interface APILog {
  id: string;
  request_id: string;
  method: string;
  path: string;
  status_code: number;
  response_time_ms: number;
  ip_address: string;
  created_at: string;
  error_code?: string;
}

export const LiveLogs: React.FC = () => {
  const [logs, setLogs] = useState<APILog[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    loadLogs();
    if (autoRefresh) {
      const interval = setInterval(loadLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, filterMethod, filterStatus]);

  const loadLogs = async () => {
    try {
      const params: any = { limit: 100 };
      if (filterMethod) params.method = filterMethod;
      if (filterStatus) params.status_code = parseInt(filterStatus);

      const response = await apiClient.get('/dev/api-logs', { params });
      setLogs(response.data.logs);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Live API Logs</h1>
          <p className="text-gray-600 mt-2">Monitor API requests in real-time</p>
        </div>
        <div className="flex gap-3 items-center">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Auto-refresh</span>
          </label>
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="">All Methods</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="">All Status</option>
            <option value="200">2xx Success</option>
            <option value="400">4xx Client Error</option>
            <option value="500">5xx Server Error</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Path</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(log.created_at).toLocaleTimeString()}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-sm font-semibold">{log.method}</span>
                </td>
                <td className="px-4 py-3 text-sm font-mono">{log.path}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      log.status_code < 300
                        ? 'bg-green-100 text-green-800'
                        : log.status_code < 400
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {log.status_code}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{log.response_time_ms}ms</td>
                <td className="px-4 py-3 text-sm font-mono text-gray-600">{log.ip_address}</td>
                <td className="px-4 py-3 text-sm font-mono text-gray-400">{log.request_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// =====================================================
// 4. MAIN DEVELOPER PORTAL LAYOUT
// =====================================================

export const DeveloperPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState('keys');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Molam Developer Portal</h1>
            <div className="flex gap-4">
              <a href="/docs" className="text-gray-600 hover:text-gray-900">
                Documentation
              </a>
              <a href="/compliance" className="text-gray-600 hover:text-gray-900">
                Compliance
              </a>
              <a href="/support" className="text-gray-600 hover:text-gray-900">
                Support
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex gap-8">
            {[
              { id: 'keys', label: 'API Keys' },
              { id: 'logs', label: 'Live Logs' },
              { id: 'playground', label: 'Playground' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 border-b-2 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main>
        {activeTab === 'keys' && <APIKeyManager />}
        {activeTab === 'logs' && <LiveLogs />}
        {activeTab === 'playground' && <Playground />}
      </main>
    </div>
  );
};

export default DeveloperPortal;
