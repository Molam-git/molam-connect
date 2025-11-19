/**
 * Brique 111 - Merchant Config UI
 * React Component: Merchant Plugin Configuration & Webhooks Dashboard
 */

import React, { useState, useEffect } from "react";

interface Plugin {
  id: string;
  cms: string;
  plugin_version: string;
  status: string;
  settings: any;
  telemetry: any;
  last_heartbeat?: string;
  error_count_24h?: number;
}

interface Webhook {
  id: string;
  event_type: string;
  url: string;
  status: string;
  health_status?: string;
  last_success_at?: string;
  last_failure_at?: string;
}

interface Update {
  id: string;
  old_version: string;
  new_version: string;
  status: string;
  created_at: string;
}

export default function MerchantConfig() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [pluginUpdates, setPluginUpdates] = useState<Update[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [pluginsRes, webhooksRes] = await Promise.all([
        fetch("/api/config/plugins", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        }),
        fetch("/api/config/webhooks", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        })
      ]);

      const pluginsData = await pluginsRes.json();
      const webhooksData = await webhooksRes.json();

      setPlugins(pluginsData);
      setWebhooks(webhooksData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function togglePluginStatus(plugin: Plugin) {
    const newStatus = plugin.status === "active" ? "disabled" : "active";
    
    try {
      await fetch(`/api/config/plugins/${plugin.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      await loadData();
    } catch (error) {
      console.error("Failed to toggle plugin status:", error);
      alert("Erreur lors de la mise à jour du statut");
    }
  }

  async function updatePlugin(plugin: Plugin) {
    const newVersion = prompt(`Nouvelle version pour ${plugin.cms}?`, plugin.plugin_version);
    if (!newVersion || newVersion === plugin.plugin_version) return;

    try {
      await fetch(`/api/config/plugins/${plugin.id}/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ new_version: newVersion })
      });

      alert("Mise à jour lancée !");
      await loadData();
    } catch (error) {
      console.error("Failed to update plugin:", error);
      alert("Erreur lors de la mise à jour");
    }
  }

  async function rollbackPlugin(updateId: string) {
    if (!selectedPlugin) return;

    const reason = prompt("Raison du rollback ?");
    if (!reason) return;

    try {
      await fetch(`/api/config/plugins/${selectedPlugin.id}/rollback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ update_id: updateId, reason })
      });

      alert("Rollback effectué !");
      await loadData();
      await loadPluginDetails(selectedPlugin.id);
    } catch (error) {
      console.error("Failed to rollback:", error);
      alert("Erreur lors du rollback");
    }
  }

  async function loadPluginDetails(pluginId: string) {
    try {
      const res = await fetch(`/api/config/plugins/${pluginId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      setSelectedPlugin(data);
      setPluginUpdates(data.updates || []);
    } catch (error) {
      console.error("Failed to load plugin details:", error);
    }
  }

  async function createWebhook() {
    const eventType = prompt("Type d'événement ? (ex: payment.succeeded)");
    const url = prompt("URL du webhook ?");
    
    if (!eventType || !url) return;

    try {
      await fetch("/api/config/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ event_type: eventType, url })
      });

      await loadData();
    } catch (error) {
      console.error("Failed to create webhook:", error);
      alert("Erreur lors de la création du webhook");
    }
  }

  async function testWebhook(webhookId: string) {
    try {
      const res = await fetch(`/api/config/webhooks/${webhookId}/test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      const result = await res.json();
      
      if (result.success) {
        alert(`✅ Webhook test réussi (${result.response_time_ms}ms)`);
      } else {
        alert(`❌ Webhook test échoué: ${result.error || "Unknown error"}`);
      }
      
      await loadData();
    } catch (error) {
      console.error("Failed to test webhook:", error);
      alert("Erreur lors du test");
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      disabled: "bg-gray-100 text-gray-800",
      error: "bg-red-100 text-red-800",
      pending_update: "bg-yellow-100 text-yellow-800"
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || "bg-gray-100"}`}>
        {status}
      </span>
    );
  }

  if (loading) {
    return <div className="p-6">Chargement...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Paramètres Plugins & Webhooks</h1>

      {/* Plugins Section */}
      <section className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Plugins installés</h2>
          <span className="text-sm text-gray-600">{plugins.length} plugin(s)</span>
        </div>

        <div className="grid gap-4">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="border rounded-xl p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">
                      {plugin.cms.toUpperCase()} v{plugin.plugin_version}
                    </h3>
                    {getStatusBadge(plugin.status)}
                  </div>
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    {plugin.last_heartbeat && (
                      <div>Dernier heartbeat: {new Date(plugin.last_heartbeat).toLocaleString()}</div>
                    )}
                    {plugin.error_count_24h !== undefined && (
                      <div>Erreurs 24h: {plugin.error_count_24h}</div>
                    )}
                    {plugin.settings?.mode && (
                      <div>Mode: {plugin.settings.mode}</div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => loadPluginDetails(plugin.id)}
                    className="px-3 py-1 border rounded-lg hover:bg-gray-50"
                  >
                    Détails
                  </button>
                  <button
                    onClick={() => updatePlugin(plugin)}
                    className="px-3 py-1 border rounded-lg hover:bg-blue-50 text-blue-600"
                  >
                    Mettre à jour
                  </button>
                  <button
                    onClick={() => togglePluginStatus(plugin)}
                    className={`px-3 py-1 border rounded-lg ${
                      plugin.status === "active"
                        ? "hover:bg-red-50 text-red-600"
                        : "hover:bg-green-50 text-green-600"
                    }`}
                  >
                    {plugin.status === "active" ? "Désactiver" : "Activer"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {plugins.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Aucun plugin installé
            </div>
          )}
        </div>
      </section>

      {/* Plugin Details Modal */}
      {selectedPlugin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                {selectedPlugin.cms} v{selectedPlugin.plugin_version}
              </h3>
              <button
                onClick={() => setSelectedPlugin(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Historique des mises à jour</h4>
                <div className="space-y-2">
                  {pluginUpdates.map((update) => (
                    <div
                      key={update.id}
                      className="border rounded p-3 flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium">
                          {update.old_version} → {update.new_version}
                        </div>
                        <div className="text-sm text-gray-600">
                          {new Date(update.created_at).toLocaleString()} - {update.status}
                        </div>
                      </div>
                      {update.status === "success" && (
                        <button
                          onClick={() => rollbackPlugin(update.id)}
                          className="px-3 py-1 border rounded text-red-600 hover:bg-red-50"
                        >
                          Rollback
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Webhooks Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Webhooks configurés</h2>
          <button
            onClick={createWebhook}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Ajouter webhook
          </button>
        </div>

        <div className="grid gap-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="border rounded-xl p-4 flex justify-between items-center"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{webhook.event_type}</span>
                  {getStatusBadge(webhook.status)}
                  {webhook.health_status && (
                    <span className="text-xs text-gray-600">({webhook.health_status})</span>
                  )}
                </div>
                <div className="text-sm text-gray-600">{webhook.url}</div>
                {webhook.last_success_at && (
                  <div className="text-xs text-gray-500 mt-1">
                    Dernier succès: {new Date(webhook.last_success_at).toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => testWebhook(webhook.id)}
                  className="px-3 py-1 border rounded-lg hover:bg-green-50 text-green-600"
                >
                  Tester
                </button>
                <button
                  onClick={async () => {
                    if (confirm("Supprimer ce webhook ?")) {
                      await fetch(`/api/config/webhooks/${webhook.id}`, {
                        method: "DELETE",
                        headers: {
                          Authorization: `Bearer ${localStorage.getItem("token")}`
                        }
                      });
                      await loadData();
                    }
                  }}
                  className="px-3 py-1 border rounded-lg hover:bg-red-50 text-red-600"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}

          {webhooks.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Aucun webhook configuré
            </div>
          )}
        </div>
      </section>
    </div>
  );
}


