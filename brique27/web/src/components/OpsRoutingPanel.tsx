
import React, { useEffect, useState } from "react";

type Rule = {
    country: string;
    event_type: string;
    primary_channel: string;
    fallback_channel?: string | null;
    updated_by: number;
    updated_at: string;
};

const CHANNELS = ["push", "sms", "email", "ussd", "webhook"];

export default function OpsRoutingPanel() {
    const [rows, setRows] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState({ country: "", event_type: "" });
    const [editing, setEditing] = useState<Partial<Rule> | null>(null);
    const [page, setPage] = useState(0);

    useEffect(() => {
        fetchRows();
    }, [page]);

    async function fetchRows() {
        setLoading(true);
        const params = new URLSearchParams({
            country: filter.country,
            event_type: filter.event_type,
            limit: "50",
            offset: String(page * 50)
        });

        const response = await fetch(`/api/admin/routing?${params.toString()}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem('molam_token')}`,
                "Accept-Language": "fr"
            }
        });

        if (!response.ok) {
            alert('Error fetching rules');
            return;
        }

        const data = await response.json();
        setRows(data.rows || []);
        setLoading(false);
    }

    function openEdit(row?: Rule) {
        setEditing(row ? { ...row } : {
            country: "",
            event_type: "",
            primary_channel: "push",
            fallback_channel: ""
        });
    }

    async function saveEdit() {
        if (!editing?.country || !editing?.event_type || !editing?.primary_channel) {
            return alert("Country, event type and primary channel are required");
        }

        const body = {
            country: editing.country,
            event_type: editing.event_type,
            primary_channel: editing.primary_channel,
            fallback_channel: editing.fallback_channel || null
        };

        const response = await fetch("/api/admin/routing", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem('molam_token')}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            alert("Save failed");
            return;
        }

        await fetchRows();
        setEditing(null);
    }

    async function deleteRule(row: Rule) {
        if (!confirm(`Delete routing rule for ${row.country} / ${row.event_type}?`)) return;

        const response = await fetch("/api/admin/routing", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem('molam_token')}`
            },
            body: JSON.stringify({
                country: row.country,
                event_type: row.event_type
            })
        });

        if (response.ok) {
            await fetchRows();
        } else {
            alert("Delete failed");
        }
    }

    function previewForUser(rule: Rule) {
        const channels = [rule.primary_channel];
        if (rule.fallback_channel) channels.push(rule.fallback_channel);

        alert(`Preview for ${rule.country}/${rule.event_type} -> ${channels.join(" > ")}`);
    }

    return (
        <div className="min-h-screen bg-white text-gray-900 p-6">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Routing — Notifications (Ops)</h1>
                    <p className="text-sm text-gray-500">
                        Manage channel routing per country & event (requires ops_notif_admin)
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        onClick={() => openEdit()}
                    >
                        New rule
                    </button>
                    <button
                        className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        onClick={fetchRows}
                    >
                        Refresh
                    </button>
                </div>
            </header>

            <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                    value={filter.country}
                    onChange={e => setFilter({ ...filter, country: e.target.value })}
                    placeholder="Country (ISO code)"
                    className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                    value={filter.event_type}
                    onChange={e => setFilter({ ...filter, event_type: e.target.value })}
                    placeholder="Event type"
                    className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex gap-2">
                    <button
                        onClick={() => { setPage(0); fetchRows(); }}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-1"
                    >
                        Search
                    </button>
                    <button
                        onClick={() => { setFilter({ country: "", event_type: "" }); setPage(0); fetchRows(); }}
                        className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Clear
                    </button>
                </div>
            </section>

            <div className="rounded-xl border border-gray-200 p-4 shadow-sm">
                <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-gray-500 bg-gray-50">
                        <tr>
                            <th className="py-3 px-2 font-medium">Country</th>
                            <th className="py-3 px-2 font-medium">Event</th>
                            <th className="py-3 px-2 font-medium">Primary</th>
                            <th className="py-3 px-2 font-medium">Fallback</th>
                            <th className="py-3 px-2 font-medium">Updated</th>
                            <th className="py-3 px-2 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="py-4 text-center text-gray-500">
                                    Loading...
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-4 text-center text-gray-500">
                                    No rules found
                                </td>
                            </tr>
                        ) : (
                            rows.map((rule, index) => (
                                <tr key={index} className="border-t border-gray-100 hover:bg-gray-50">
                                    <td className="py-3 px-2 font-medium">{rule.country}</td>
                                    <td className="py-3 px-2 font-mono text-xs">{rule.event_type}</td>
                                    <td className="py-3 px-2">
                                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                            {rule.primary_channel}
                                        </span>
                                    </td>
                                    <td className="py-3 px-2">
                                        {rule.fallback_channel ? (
                                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                                {rule.fallback_channel}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">—</span>
                                        )}
                                    </td>
                                    <td className="py-3 px-2 text-gray-500">
                                        {new Date(rule.updated_at).toLocaleDateString()} {new Date(rule.updated_at).toLocaleTimeString()}
                                    </td>
                                    <td className="py-3 px-2">
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => openEdit(rule)}
                                                className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs hover:bg-yellow-200 transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => previewForUser(rule)}
                                                className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors"
                                            >
                                                Preview
                                            </button>
                                            <button
                                                onClick={() => deleteRule(rule)}
                                                className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs hover:bg-red-200 transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                <div className="mt-4 flex justify-between items-center">
                    <div className="text-sm text-gray-500">Page {page + 1}</div>
                    <div className="flex gap-2">
                        <button
                            className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                            onClick={() => { if (page > 0) { setPage(p => p - 1); fetchRows(); } }}
                            disabled={page === 0}
                        >
                            Previous
                        </button>
                        <button
                            className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                            onClick={() => { setPage(p => p + 1); fetchRows(); }}
                            disabled={rows.length < 50}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {editing && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-6 z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-xl">
                        <h3 className="text-lg font-semibold mb-4">
                            {editing.country ? "Edit routing rule" : "Create new routing rule"}
                        </h3>
                        <div className="grid gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Country (ISO code) *
                                </label>
                                <input
                                    value={editing.country || ""}
                                    onChange={e => setEditing({ ...editing, country: e.target.value.toUpperCase() })}
                                    placeholder="e.g. SN, FR, US"
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Event type *
                                </label>
                                <input
                                    value={editing.event_type || ""}
                                    onChange={e => setEditing({ ...editing, event_type: e.target.value })}
                                    placeholder="e.g. wallet.p2p.succeeded"
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Primary channel *
                                </label>
                                <select
                                    value={editing.primary_channel}
                                    onChange={e => setEditing({ ...editing, primary_channel: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    {CHANNELS.map(channel => (
                                        <option key={channel} value={channel}>{channel}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Fallback channel (optional)
                                </label>
                                <select
                                    value={editing.fallback_channel || ""}
                                    onChange={e => setEditing({ ...editing, fallback_channel: e.target.value || null })}
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">— None —</option>
                                    {CHANNELS.map(channel => (
                                        <option key={channel} value={channel}>{channel}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200">
                                <button
                                    onClick={() => setEditing(null)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveEdit}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                >
                                    Save rule
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}