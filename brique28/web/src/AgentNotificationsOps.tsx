// web/src/AgentNotificationsOps.tsx
import React, { useEffect, useState } from "react";

interface NotificationRow {
    id: string;
    channel: string;
    zone_code: string;
    language: string;
    currency: string;
    status: string;
    provider_attempts: any[];
    agent_id?: number;
}

export default function AgentNotificationsOps() {
    const [rows, setRows] = useState<NotificationRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function fetchRows() {
        setLoading(true);
        setError(null);
        try {
            const r = await fetch("/api/admin/notifications/ops", {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("molam_token")}`
                }
            });

            if (!r.ok) {
                throw new Error(`HTTP ${r.status}: ${await r.text()}`);
            }

            const data = await r.json();
            setRows(data.rows || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchRows();
    }, []);

    async function requeue(id: string) {
        try {
            await fetch(`/api/admin/notifications/${id}/requeue`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("molam_token")}`
                },
                body: JSON.stringify({ reason: "manual_requeue" })
            });
            await fetchRows();
        } catch (err: any) {
            setError(err.message);
        }
    }

    async function abort(id: string) {
        try {
            await fetch(`/api/admin/notifications/${id}/abort`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("molam_token")}`
                },
                body: JSON.stringify({ reason: "manual_abort" })
            });
            await fetchRows();
        } catch (err: any) {
            setError(err.message);
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
            <header className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Molam Ops — Notifications</h1>
                    <p className="text-sm text-slate-600">Pending & failed notifications (agent_ops / pay_admin)</p>
                </div>
                <div className="flex items-center gap-4">
                    {error && (
                        <div className="text-red-600 text-sm bg-red-50 px-3 py-1 rounded">
                            {error}
                        </div>
                    )}
                    <button
                        onClick={fetchRows}
                        disabled={loading}
                        className="px-4 py-2 bg-slate-800 text-white rounded disabled:opacity-50"
                    >
                        {loading ? "Refreshing..." : "Refresh"}
                    </button>
                </div>
            </header>

            <main>
                <div className="bg-white rounded-xl shadow p-4">
                    {loading ? (
                        <div className="text-center py-8">Loading notifications...</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="text-left border-b">
                                <tr>
                                    <th className="py-2">ID</th>
                                    <th>Channel</th>
                                    <th>Zone</th>
                                    <th>Lang</th>
                                    <th>Status</th>
                                    <th>Attempts</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.id} className="border-b hover:bg-slate-50">
                                        <td className="py-2 font-mono text-xs">{r.id.slice(0, 8)}...</td>
                                        <td>
                                            <span className={`px-2 py-1 rounded text-xs ${r.channel === 'sms' ? 'bg-blue-100 text-blue-800' :
                                                    r.channel === 'email' ? 'bg-green-100 text-green-800' :
                                                        'bg-purple-100 text-purple-800'
                                                }`}>
                                                {r.channel}
                                            </span>
                                        </td>
                                        <td>{r.zone_code}</td>
                                        <td>{r.language}</td>
                                        <td>
                                            <span className={`px-2 py-1 rounded text-xs ${r.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                    r.status === 'failed' ? 'bg-red-100 text-red-800' :
                                                        'bg-gray-100 text-gray-800'
                                                }`}>
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="text-center">{(r.provider_attempts || []).length}</td>
                                        <td className="py-2">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => requeue(r.id)}
                                                    className="px-3 py-1 border border-blue-500 text-blue-600 rounded text-sm hover:bg-blue-50"
                                                >
                                                    Requeue
                                                </button>
                                                <button
                                                    onClick={() => abort(r.id)}
                                                    className="px-3 py-1 border border-red-500 text-red-600 rounded text-sm hover:bg-red-50"
                                                >
                                                    Abort
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="py-8 text-center text-slate-500">
                                            No pending or failed notifications
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>
        </div>
    );
}