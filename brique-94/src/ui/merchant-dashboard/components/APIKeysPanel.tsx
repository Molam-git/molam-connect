import React, { useState, useEffect } from 'react';

interface APIKey {
  id: string;
  key_type: string;
  environment: string;
  key_prefix: string;
  key_suffix: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
}

interface Props {
  merchantId: string;
  userId: string;
}

const APIKeysPanel: React.FC<Props> = ({ merchantId, userId }) => {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyType, setNewKeyType] = useState<string>('publishable');
  const [newKeyEnvironment, setNewKeyEnvironment] = useState<string>('test');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  useEffect(() => {
    fetchAPIKeys();
  }, [merchantId]);

  const fetchAPIKeys = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/form/api-keys?merchant_id=${merchantId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`
        }
      });
      const data = await response.json();
      setApiKeys(data.keys || []);
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const createAPIKey = async () => {
    try {
      const response = await fetch('/form/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          key_type: newKeyType,
          environment: newKeyEnvironment
        })
      });

      const data = await response.json();
      if (response.ok) {
        setNewlyCreatedKey(data.api_key);
        fetchAPIKeys();
      } else {
        alert(`Error: ${data.message}`);
      }
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
      const response = await fetch(`/form/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`
        }
      });

      if (response.ok) {
        fetchAPIKeys();
        alert('API key revoked successfully');
      } else {
        const data = await response.json();
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error('Failed to revoke API key:', error);
      alert('Failed to revoke API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="panel api-keys-panel">
      <div className="panel-header">
        <h2>API Keys</h2>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + Create New Key
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading API keys...</div>
      ) : (
        <div className="api-keys-list">
          {apiKeys.length === 0 ? (
            <div className="empty-state">
              <p>No API keys found. Create your first API key to get started.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Environment</th>
                  <th>Key</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map(key => (
                  <tr key={key.id}>
                    <td>
                      <span className={`badge badge-${key.key_type}`}>
                        {key.key_type === 'publishable' ? '🔓 Publishable' : '🔒 Secret'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${key.environment}`}>
                        {key.environment === 'test' ? '🧪 Test' : '🚀 Live'}
                      </span>
                    </td>
                    <td className="key-display">
                      <code>{key.key_prefix}...{key.key_suffix}</code>
                    </td>
                    <td>
                      <span className={`status status-${key.status}`}>{key.status}</span>
                    </td>
                    <td>{new Date(key.created_at).toLocaleDateString()}</td>
                    <td>{key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}</td>
                    <td>
                      {key.status === 'active' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => revokeAPIKey(key.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create API Key Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New API Key</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {newlyCreatedKey ? (
                <div className="success-message">
                  <h4>✓ API Key Created Successfully!</h4>
                  <p className="warning-text">⚠️ This key will only be shown once. Please copy it now and store it securely.</p>
                  <div className="key-reveal">
                    <code>{newlyCreatedKey}</code>
                    <button
                      className="btn btn-secondary"
                      onClick={() => copyToClipboard(newlyCreatedKey)}
                    >
                      📋 Copy
                    </button>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setNewlyCreatedKey(null);
                      setShowCreateModal(false);
                    }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Key Type</label>
                    <select
                      value={newKeyType}
                      onChange={(e) => setNewKeyType(e.target.value)}
                      className="form-control"
                    >
                      <option value="publishable">Publishable (pk_)</option>
                      <option value="secret">Secret (sk_)</option>
                    </select>
                    <small className="form-text">
                      {newKeyType === 'publishable'
                        ? 'Publishable keys can be safely embedded in client-side code.'
                        : 'Secret keys should only be used on your server and never exposed publicly.'}
                    </small>
                  </div>

                  <div className="form-group">
                    <label>Environment</label>
                    <select
                      value={newKeyEnvironment}
                      onChange={(e) => setNewKeyEnvironment(e.target.value)}
                      className="form-control"
                    >
                      <option value="test">Test</option>
                      <option value="live">Live</option>
                    </select>
                    <small className="form-text">
                      {newKeyEnvironment === 'test'
                        ? 'Test mode for development and testing.'
                        : 'Live mode for production payments.'}
                    </small>
                  </div>

                  <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                      Cancel
                    </button>
                    <button className="btn btn-primary" onClick={createAPIKey}>
                      Create Key
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default APIKeysPanel;
