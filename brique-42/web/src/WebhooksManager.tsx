/**
 * Brique 42 - Connect Payments
 * Webhooks Manager Component
 *
 * Apple-inspired UI for managing webhook endpoints
 * Features: Create, edit, delete, test webhooks
 */

import React, { useState, useEffect, useCallback } from "react";
import "./WebhooksManager.css";

// ============================================================================
// Types
// ============================================================================

interface Webhook {
  id: string;
  connect_account_id: string;
  url: string;
  secret: string;
  enabled: boolean;
  events: string[];
  description?: string;
  api_version: string;
  created_at: string;
  updated_at: string;
  last_triggered_at?: string;
}

interface WebhooksManagerProps {
  connectAccountId: string;
  apiUrl?: string;
  authToken: string;
}

// ============================================================================
// Available Events
// ============================================================================

const AVAILABLE_EVENTS = [
  { value: "payment.intent.created", label: "Payment Intent Created" },
  { value: "payment.charge.authorized", label: "Charge Authorized" },
  { value: "payment.charge.captured", label: "Charge Captured" },
  { value: "payment.intent.canceled", label: "Intent Canceled" },
  { value: "payment.refund.succeeded", label: "Refund Succeeded" },
  { value: "payment.refund.failed", label: "Refund Failed" },
  { value: "payout.created", label: "Payout Created" },
  { value: "payout.succeeded", label: "Payout Succeeded" },
  { value: "payout.failed", label: "Payout Failed" },
];

// ============================================================================
// Component
// ============================================================================

export const WebhooksManager: React.FC<WebhooksManagerProps> = ({
  connectAccountId,
  apiUrl = "http://localhost:8042",
  authToken,
}) => {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);

  // Form state
  const [formUrl, setFormUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>(AVAILABLE_EVENTS.map((e) => e.value));
  const [formEnabled, setFormEnabled] = useState(true);

  // ============================================================================
  // Fetch Webhooks
  // ============================================================================

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/connect/webhooks?connect_account_id=${connectAccountId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch webhooks");
      }

      const data = await response.json();
      setWebhooks(data.webhooks || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [connectAccountId, apiUrl, authToken]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  // ============================================================================
  // Create/Update Webhook
  // ============================================================================

  const handleSaveWebhook = async () => {
    if (!formUrl) {
      alert("Please enter a webhook URL");
      return;
    }

    try {
      const payload = {
        connect_account_id: connectAccountId,
        url: formUrl,
        description: formDescription,
        events: formEvents,
        enabled: formEnabled,
      };

      const url = editingWebhook
        ? `${apiUrl}/api/connect/webhooks/${editingWebhook.id}`
        : `${apiUrl}/api/connect/webhooks`;

      const method = editingWebhook ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save webhook");
      }

      // Refresh list and close modal
      await fetchWebhooks();
      handleCloseModal();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // ============================================================================
  // Delete Webhook
  // ============================================================================

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm("Are you sure you want to delete this webhook?")) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/api/connect/webhooks/${webhookId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete webhook");
      }

      await fetchWebhooks();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // ============================================================================
  // Test Webhook
  // ============================================================================

  const handleTestWebhook = async (webhookId: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/connect/webhooks/${webhookId}/test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to send test webhook");
      }

      alert("Test webhook sent successfully!");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // ============================================================================
  // Toggle Webhook Enabled/Disabled
  // ============================================================================

  const handleToggleWebhook = async (webhook: Webhook) => {
    try {
      const response = await fetch(`${apiUrl}/api/connect/webhooks/${webhook.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: !webhook.enabled,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to toggle webhook");
      }

      await fetchWebhooks();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // ============================================================================
  // Modal Handlers
  // ============================================================================

  const handleOpenModal = (webhook?: Webhook) => {
    if (webhook) {
      setEditingWebhook(webhook);
      setFormUrl(webhook.url);
      setFormDescription(webhook.description || "");
      setFormEvents(webhook.events);
      setFormEnabled(webhook.enabled);
    } else {
      setEditingWebhook(null);
      setFormUrl("");
      setFormDescription("");
      setFormEvents(AVAILABLE_EVENTS.map((e) => e.value));
      setFormEnabled(true);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingWebhook(null);
  };

  const handleToggleEvent = (eventValue: string) => {
    if (formEvents.includes(eventValue)) {
      setFormEvents(formEvents.filter((e) => e !== eventValue));
    } else {
      setFormEvents([...formEvents, eventValue]);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return <div className="webhooks-loading">Loading webhooks...</div>;
  }

  if (error) {
    return <div className="webhooks-error">Error: {error}</div>;
  }

  return (
    <div className="webhooks-manager">
      <div className="webhooks-header">
        <h2>Webhook Endpoints</h2>
        <button className="btn-primary" onClick={() => handleOpenModal()}>
          + Add Endpoint
        </button>
      </div>

      {webhooks.length === 0 ? (
        <div className="webhooks-empty">
          <p>No webhook endpoints configured</p>
          <p className="webhooks-empty-hint">Add an endpoint to start receiving real-time events</p>
        </div>
      ) : (
        <div className="webhooks-list">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className={`webhook-card ${webhook.enabled ? "" : "disabled"}`}>
              <div className="webhook-card-header">
                <div className="webhook-card-title">
                  <span className={`status-badge ${webhook.enabled ? "enabled" : "disabled"}`}>
                    {webhook.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <code className="webhook-url">{webhook.url}</code>
                </div>
                <div className="webhook-card-actions">
                  <button className="btn-icon" onClick={() => handleTestWebhook(webhook.id)} title="Test webhook">
                    🧪
                  </button>
                  <button className="btn-icon" onClick={() => handleOpenModal(webhook)} title="Edit">
                    ✏️
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleToggleWebhook(webhook)}
                    title={webhook.enabled ? "Disable" : "Enable"}
                  >
                    {webhook.enabled ? "⏸" : "▶️"}
                  </button>
                  <button
                    className="btn-icon btn-delete"
                    onClick={() => handleDeleteWebhook(webhook.id)}
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {webhook.description && <p className="webhook-description">{webhook.description}</p>}

              <div className="webhook-events">
                <strong>Events:</strong> {webhook.events.join(", ")}
              </div>

              {webhook.last_triggered_at && (
                <div className="webhook-last-triggered">
                  Last triggered: {new Date(webhook.last_triggered_at).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingWebhook ? "Edit Webhook" : "Add Webhook"}</h3>
              <button className="btn-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Endpoint URL *</label>
                <input
                  type="url"
                  className="form-control"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://example.com/webhooks/molam"
                  disabled={!!editingWebhook}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  className="form-control"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>

              <div className="form-group">
                <label>Events to listen to</label>
                <div className="events-checklist">
                  {AVAILABLE_EVENTS.map((event) => (
                    <label key={event.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={formEvents.includes(event.value)}
                        onChange={() => handleToggleEvent(event.value)}
                      />
                      <span>{event.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input type="checkbox" checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} />
                  <span>Enabled</span>
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={handleCloseModal}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveWebhook}>
                {editingWebhook ? "Save Changes" : "Create Webhook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebhooksManager;
