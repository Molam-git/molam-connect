import React, { useState, useEffect } from 'react';

interface Log {
  id: string;
  event_type: string;
  sdk_version: string;
  platform: string;
  payload: any;
  intent_reference: string | null;
  logged_at: string;
}

interface Props {
  merchantId: string;
}

const LogsPanel: React.FC<Props> = ({ merchantId }) => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);
  const [offset, setOffset] = useState<number>(0);

  useEffect(() => {
    fetchLogs();
  }, [merchantId, filter, limit, offset]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let url = `/form/logs?merchant_id=${merchantId}&limit=${limit}&offset=${offset}`;
      if (filter) {
        url += `&event_type=${filter}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`
        }
      });
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const eventTypeColors: { [key: string]: string } = {
    intent_created: 'blue',
    intent_confirmed: 'green',
    intent_canceled: 'red',
    payment_method_tokenized: 'purple',
    error_displayed: 'orange',
    custom_event: 'gray'
  };

  const getEventColor = (eventType: string): string => {
    for (const [key, color] of Object.entries(eventTypeColors)) {
      if (eventType.includes(key)) return color;
    }
    return 'gray';
  };

  const formatPayload = (payload: any): string => {
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        return payload;
      }
    }
    return JSON.stringify(payload, null, 2);
  };

  return (
    <div className="panel logs-panel">
      <div className="panel-header">
        <h2>Plugin Logs</h2>
        <div className="logs-controls">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="form-control"
          >
            <option value="">All Events</option>
            <option value="intent_created">Intent Created</option>
            <option value="intent_confirmed">Intent Confirmed</option>
            <option value="intent_canceled">Intent Canceled</option>
            <option value="payment_method_tokenized">Payment Method Tokenized</option>
            <option value="error_displayed">Errors</option>
            <option value="custom_event">Custom Events</option>
          </select>
          <button className="btn btn-secondary" onClick={fetchLogs}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading logs...</div>
      ) : (
        <>
          <div className="logs-list">
            {logs.length === 0 ? (
              <div className="empty-state">
                <p>No logs found for the selected filter.</p>
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="log-entry">
                  <div className="log-header">
                    <span className={`event-badge event-${getEventColor(log.event_type)}`}>
                      {log.event_type}
                    </span>
                    <span className="log-time">
                      {new Date(log.logged_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="log-meta">
                    <span className="log-platform">
                      📱 {log.platform} | v{log.sdk_version}
                    </span>
                    {log.intent_reference && (
                      <span className="log-intent">
                        💳 {log.intent_reference}
                      </span>
                    )}
                  </div>
                  {log.payload && Object.keys(log.payload).length > 0 && (
                    <details className="log-payload">
                      <summary>View Payload</summary>
                      <pre>{formatPayload(log.payload)}</pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="pagination">
            <button
              className="btn btn-secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              ← Previous
            </button>
            <span className="pagination-info">
              Showing {offset + 1} - {offset + logs.length}
            </span>
            <button
              className="btn btn-secondary"
              disabled={logs.length < limit}
              onClick={() => setOffset(offset + limit)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default LogsPanel;
