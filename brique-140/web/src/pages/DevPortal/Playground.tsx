/**
 * BRIQUE 140 — API Playground
 */

import React, { useState } from 'react';

const SAMPLE_ENDPOINTS = [
  { path: '/v1/payments', method: 'POST', body: { amount: 1000, currency: 'XOF' } },
  { path: '/v1/customers', method: 'POST', body: { email: 'test@example.com' } },
  { path: '/v1/payment_intents', method: 'GET', body: null },
];

export default function Playground() {
  const [endpoint, setEndpoint] = useState('/v1/payments');
  const [method, setMethod] = useState('POST');
  const [payload, setPayload] = useState(
    JSON.stringify({ amount: 1000, currency: 'XOF' }, null, 2)
  );
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function executeRequest() {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const parsedPayload = payload.trim() ? JSON.parse(payload) : null;

      const r = await fetch(`/api/proxy/playground`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          method,
          payload: parsedPayload,
        }),
      });

      const j = await r.json();
      setResponse(j);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function loadSample(sample: any) {
    setEndpoint(sample.path);
    setMethod(sample.method);
    setPayload(sample.body ? JSON.stringify(sample.body, null, 2) : '');
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold mb-6">API Playground</h2>

      <div className="space-y-4">
        {/* Sample requests */}
        <div>
          <label className="block text-sm font-medium mb-2">Quick Start</label>
          <div className="flex gap-2 flex-wrap">
            {SAMPLE_ENDPOINTS.map((sample, idx) => (
              <button
                key={idx}
                onClick={() => loadSample(sample)}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                {sample.method} {sample.path}
              </button>
            ))}
          </div>
        </div>

        {/* Request configuration */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium mb-2">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm font-medium mb-2">Endpoint</label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="/v1/payments"
            />
          </div>
        </div>

        {/* Request body */}
        <div>
          <label className="block text-sm font-medium mb-2">Request Body (JSON)</label>
          <textarea
            rows={8}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            placeholder='{\n  "amount": 1000,\n  "currency": "XOF"\n}'
          />
        </div>

        {/* Execute button */}
        <div>
          <button
            onClick={executeRequest}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Executing...' : 'Execute Request'}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Running in test environment with sandbox data
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Response display */}
        {response && (
          <div>
            <h3 className="font-medium mb-2">Response</h3>
            <div className="bg-gray-50 border border-gray-300 rounded-md p-4">
              <pre className="text-sm overflow-x-auto">
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* cURL snippet */}
        {response && (
          <div>
            <h3 className="font-medium mb-2">cURL Equivalent</h3>
            <div className="bg-gray-900 text-green-400 rounded-md p-4">
              <pre className="text-sm overflow-x-auto">
                {`curl -X ${method} https://api.molam.com${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ak_test_YOUR_KEY:SIGNATURE" \\
  -d '${payload}'`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
