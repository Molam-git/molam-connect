/**
 * BRIQUE TRANSLATION — Ops Dashboard
 * Complete UI for managing translation overrides and viewing audit logs
 */
import React, { useEffect, useState } from "react";
import { api } from "../utils/api";

interface Override {
  id: string;
  namespace: string;
  source_text: string;
  target_lang: string;
  override_text: string;
  created_by: string | null;
  created_at: string;
}

interface AuditLog {
  id: number;
  user_id: string | null;
  action: string;
  namespace: string;
  details: any;
  created_at: string;
}

export default function OpsTranslationsDashboard() {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [form, setForm] = useState({
    source_text: "",
    target_lang: "fr",
    override_text: "",
    namespace: "default"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ovr, aud] = await Promise.all([
        api.getOverrides(form.namespace),
        api.getAudit(form.namespace)
      ]);
      setOverrides(ovr);
      setAudit(aud);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [form.namespace]);

  async function createOverride(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.source_text || !form.override_text) {
      setError("Source text and override text are required");
      return;
    }

    try {
      await api.createOverride(form);
      setForm({ ...form, source_text: "", override_text: "" });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteOverride(id: string) {
    if (!confirm("Delete this override?")) return;

    try {
      await api.deleteOverride(id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Translation Ops Dashboard</h1>
        <button
          onClick={load}
          className="px-4 py-2 rounded border hover:bg-gray-100"
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      {/* Create Override Form */}
      <form onSubmit={createOverride} className="grid gap-4 border p-6 rounded-lg bg-gray-50">
        <h2 className="text-xl font-semibold">Create Override</h2>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Namespace</label>
          <input
            className="p-2 border rounded"
            placeholder="default"
            value={form.namespace}
            onChange={e => setForm({ ...form, namespace: e.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Source Text</label>
          <textarea
            className="p-2 border rounded"
            placeholder="Enter source text..."
            rows={3}
            value={form.source_text}
            onChange={e => setForm({ ...form, source_text: e.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Target Language</label>
          <select
            className="p-2 border rounded"
            value={form.target_lang}
            onChange={e => setForm({ ...form, target_lang: e.target.value })}
          >
            <option value="fr">French (fr)</option>
            <option value="en">English (en)</option>
            <option value="wo">Wolof (wo)</option>
            <option value="ar">Arabic (ar)</option>
            <option value="es">Spanish (es)</option>
            <option value="pt">Portuguese (pt)</option>
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Override Text</label>
          <textarea
            className="p-2 border rounded"
            placeholder="Enter override translation..."
            rows={3}
            value={form.override_text}
            onChange={e => setForm({ ...form, override_text: e.target.value })}
          />
        </div>

        <button
          type="submit"
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Create Override
        </button>
      </form>

      {/* Overrides List */}
      <section className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">
          Overrides ({overrides.length})
        </h2>

        {overrides.length === 0 ? (
          <p className="text-gray-500">No overrides found for namespace "{form.namespace}"</p>
        ) : (
          <div className="space-y-3">
            {overrides.map(o => (
              <div key={o.id} className="border rounded-lg p-4 flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-sm text-gray-600 mb-1">
                    {o.target_lang} • {o.namespace}
                  </div>
                  <div className="text-sm font-mono bg-gray-100 p-2 rounded mb-2">
                    {o.source_text}
                  </div>
                  <div className="text-sm font-medium text-blue-600">
                    → {o.override_text}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Created {new Date(o.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => deleteOverride(o.id)}
                  className="ml-4 px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Audit Trail */}
      <section className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Audit Trail</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left">User ID</th>
                <th className="px-4 py-2 text-left">Action</th>
                <th className="px-4 py-2 text-left">Namespace</th>
                <th className="px-4 py-2 text-left">Details</th>
                <th className="px-4 py-2 text-left">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {audit.map(a => (
                <tr key={a.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    {a.user_id ? a.user_id.substring(0, 8) : "—"}
                  </td>
                  <td className="px-4 py-2">{a.action}</td>
                  <td className="px-4 py-2">{a.namespace}</td>
                  <td className="px-4 py-2 font-mono text-xs max-w-xs truncate">
                    {JSON.stringify(a.details)}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
