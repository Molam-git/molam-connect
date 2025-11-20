/**
 * Brique 117-bis: Playground React Component
 * Interface interactive pour tester l'API
 */

import React, { useState } from 'react';

interface Request {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}

interface PlaygroundProps {
  apiBase?: string;
}

export default function Playground({ apiBase = 'http://localhost:8082' }: PlaygroundProps) {
  const [request, setRequest] = useState<Request>({
    method: 'POST',
    path: '/v1/payments',
    headers: { 'Content-Type': 'application/json' },
    body: { amount: 5000, currency: 'XOF', method: 'wallet' }
  });

  const [response, setResponse] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'request' | 'response' | 'snippets'>('request');
  const [snippets, setSnippets] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const runRequest = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/playground/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'playground-user' },
        body: JSON.stringify(request)
      });

      const data = await res.json();

      if (data.success) {
        setResponse(data.response);
        setSuggestions(data.sira_suggestions || []);
        setSessionId(data.session_id);
        setActiveTab('response');
      }
    } catch (error: any) {
      setResponse({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const saveSession = async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(`${apiBase}/api/playground/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'playground-user' },
        body: JSON.stringify({ sessionId })
      });

      const data = await res.json();
      if (data.success) {
        setSnippets(data.snippets);
        setActiveTab('snippets');
        alert('✅ Session sauvegardée!');
      }
    } catch (error: any) {
      alert('❌ Erreur: ' + error.message);
    }
  };

  const shareSession = async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(`${apiBase}/api/playground/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'playground-user' },
        body: JSON.stringify({ sessionId })
      });

      const data = await res.json();
      if (data.success) {
        navigator.clipboard.writeText(data.url);
        alert(`✅ Lien copié: ${data.url}`);
      }
    } catch (error: any) {
      alert('❌ Erreur: ' + error.message);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>🔮 API Playground</h2>
        <div style={styles.actions}>
          <button onClick={runRequest} disabled={loading} style={styles.runBtn}>
            {loading ? '⏳ Exécution...' : '▶️ Exécuter'}
          </button>
          {sessionId && (
            <>
              <button onClick={saveSession} style={styles.saveBtn}>💾 Sauvegarder</button>
              <button onClick={shareSession} style={styles.shareBtn}>🔗 Partager</button>
            </>
          )}
        </div>
      </div>

      <div style={styles.layout}>
        {/* Left: Request Editor */}
        <div style={styles.left}>
          <div style={styles.methodBar}>
            <select
              value={request.method}
              onChange={e => setRequest({ ...request, method: e.target.value })}
              style={styles.methodSelect}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
            <input
              type="text"
              value={request.path}
              onChange={e => setRequest({ ...request, path: e.target.value })}
              style={styles.pathInput}
              placeholder="/v1/payments"
            />
          </div>

          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Body (JSON)</h4>
            <textarea
              value={JSON.stringify(request.body, null, 2)}
              onChange={e => {
                try {
                  setRequest({ ...request, body: JSON.parse(e.target.value) });
                } catch {}
              }}
              style={styles.textarea}
              rows={15}
            />
          </div>

          {/* Sira Suggestions */}
          {suggestions.length > 0 && (
            <div style={styles.suggestions}>
              <h4 style={styles.sectionTitle}>🤖 Suggestions Sira</h4>
              {suggestions.map((s, i) => (
                <div key={i} style={styles.suggestion}>
                  <div style={styles.suggestionHeader}>
                    <span style={s.severity === 'error' ? styles.errorBadge : styles.warningBadge}>
                      {s.severity}
                    </span>
                    <span>{s.message}</span>
                  </div>
                  {s.fix && (
                    <div style={styles.suggestionFix}>
                      💡 {s.fix}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Tabs */}
        <div style={styles.right}>
          <div style={styles.tabs}>
            <button
              onClick={() => setActiveTab('response')}
              style={activeTab === 'response' ? styles.tabActive : styles.tab}
            >
              Response
            </button>
            <button
              onClick={() => setActiveTab('snippets')}
              style={activeTab === 'snippets' ? styles.tabActive : styles.tab}
            >
              Code Snippets
            </button>
          </div>

          {activeTab === 'response' && (
            <div style={styles.tabContent}>
              <h4 style={styles.sectionTitle}>API Response</h4>
              <pre style={styles.pre}>
                {response ? JSON.stringify(response, null, 2) : 'Cliquez sur "Exécuter" pour voir la réponse'}
              </pre>
            </div>
          )}

          {activeTab === 'snippets' && (
            <div style={styles.tabContent}>
              {snippets.length === 0 ? (
                <p style={styles.hint}>Cliquez sur "Sauvegarder" pour générer les snippets</p>
              ) : (
                snippets.map((snippet, i) => (
                  <div key={i} style={styles.snippet}>
                    <div style={styles.snippetHeader}>
                      <strong>{snippet.language.toUpperCase()}</strong>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(snippet.code);
                          alert('✅ Code copié!');
                        }}
                        style={styles.copyBtn}
                      >
                        📋 Copier
                      </button>
                    </div>
                    <pre style={styles.pre}>{snippet.code}</pre>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '20px',
    backgroundColor: '#f5f5f5',
    minHeight: '100vh'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    margin: 0
  },
  actions: {
    display: 'flex',
    gap: '10px'
  },
  runBtn: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  saveBtn: {
    padding: '10px 20px',
    background: '#22c55e',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  shareBtn: {
    padding: '10px 20px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px'
  },
  left: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  right: {
    background: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  methodBar: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px'
  },
  methodSelect: {
    padding: '10px',
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600'
  },
  pathInput: {
    flex: 1,
    padding: '10px',
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    fontSize: '14px'
  },
  section: {
    marginBottom: '20px'
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '10px',
    color: '#333'
  },
  textarea: {
    width: '100%',
    padding: '12px',
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '13px',
    resize: 'vertical'
  },
  suggestions: {
    marginTop: '20px'
  },
  suggestion: {
    padding: '12px',
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '6px',
    marginBottom: '10px'
  },
  suggestionHeader: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    marginBottom: '5px'
  },
  errorBadge: {
    padding: '2px 8px',
    background: '#dc3545',
    color: 'white',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600'
  },
  warningBadge: {
    padding: '2px 8px',
    background: '#ffc107',
    color: '#000',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600'
  },
  suggestionFix: {
    fontSize: '12px',
    color: '#666',
    marginTop: '5px'
  },
  tabs: {
    display: 'flex',
    borderBottom: '2px solid #e0e0e0'
  },
  tab: {
    flex: 1,
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#666'
  },
  tabActive: {
    flex: 1,
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid #667eea',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: '#667eea'
  },
  tabContent: {
    padding: '20px'
  },
  pre: {
    background: '#f8f9fa',
    padding: '16px',
    borderRadius: '6px',
    overflow: 'auto',
    fontSize: '13px',
    fontFamily: 'monospace',
    maxHeight: '500px'
  },
  hint: {
    textAlign: 'center',
    color: '#999',
    padding: '40px'
  },
  snippet: {
    marginBottom: '20px'
  },
  snippetHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  copyBtn: {
    padding: '6px 12px',
    background: '#f0f0f0',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
  }
};
