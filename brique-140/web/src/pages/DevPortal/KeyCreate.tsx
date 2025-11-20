/**
 * BRIQUE 140 — Key Creation Page
 */

import React, { useState } from 'react';

interface KeyCreateProps {
  appId?: string;
}

export default function KeyCreate({ appId }: KeyCreateProps) {
  const [env, setEnv] = useState('test');
  const [keyType, setKeyType] = useState('api_key');
  const [name, setName] = useState('');
  const [resp, setResp] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createKey() {
    setLoading(true);
    try {
      const r = await fetch(`/api/dev/apps/${appId}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_type: keyType, environment: env, name }),
      });
      const j = await r.json();
      setResp(j);
    } catch (error) {
      console.error('Failed to create key:', error);
    } finally {
      setLoading(false);
    }
  }

  function copySecret() {
    if (resp?.secret) {
      navigator.clipboard.writeText(resp.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-semibold mb-6">Create API Key</h2>

      {!resp ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Key Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Production Key"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Environment</label>
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="test">Test (Sandbox)</option>
              <option value="live">Live (Production)</option>
            </select>
            {env === 'live' && (
              <p className="text-sm text-amber-600 mt-1">
                ⚠️ Live keys require KYC verification
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Key Type</label>
            <select
              value={keyType}
              onChange={(e) => setKeyType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="api_key">API Key (Server-to-Server)</option>
              <option value="oauth_client">OAuth Client</option>
            </select>
          </div>

          <button
            onClick={createKey}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Key'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-medium text-green-800">API Key Created Successfully</span>
            </div>
          </div>

          <div className="p-4 border border-gray-200 rounded-md">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Key ID</label>
                <div className="mt-1 font-mono text-sm bg-gray-50 p-2 rounded border">
                  {resp.key_id}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Secret Key</label>
                <div className="mt-1 relative">
                  <div className="font-mono text-sm bg-gray-50 p-2 rounded border break-all">
                    {resp.secret || resp.secret_preview}
                  </div>
                  {resp.secret && (
                    <button
                      onClick={copySecret}
                      className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-red-600 mt-2">
                  ⚠️ Save this secret now. You won't be able to see it again.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Environment</label>
                <div className="mt-1 text-sm">
                  <span
                    className={`inline-block px-2 py-1 rounded ${
                      resp.environment === 'live'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {resp.environment}
                  </span>
                </div>
              </div>

              {resp.expires_at && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Expires</label>
                  <div className="mt-1 text-sm text-gray-600">
                    {new Date(resp.expires_at).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setResp(null)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Create Another Key
          </button>
        </div>
      )}
    </div>
  );
}
