import React, { useEffect, useState } from "react";
import io, { Socket } from "socket.io-client";

interface DashboardUpdate {
    type: string;
    data: any;
}

interface KPIStats {
    totalVolume: number;
    totalFees: number;
    totalCount: number;
}

export default function RealTimeDashboard() {
    const [updates, setUpdates] = useState<DashboardUpdate[]>([]);
    const [kpiStats, setKpiStats] = useState<KPIStats>({ totalVolume: 0, totalFees: 0, totalCount: 0 });
    const [alerts, setAlerts] = useState<any[]>([]);
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const token = localStorage.getItem("molam_token");
        const socketInstance = io(process.env.REACT_APP_WS_URL || "http://localhost:3001", {
            auth: { token },
            path: "/ws"
        });

        setSocket(socketInstance);

        socketInstance.on("update", (payload: DashboardUpdate) => {
            setUpdates(u => [payload, ...u].slice(0, 200));

            // Update KPI stats based on update type
            if (payload.type === "txn_delta") {
                setKpiStats(prev => ({
                    totalVolume: prev.totalVolume + (payload.data.amount || 0),
                    totalFees: prev.totalFees + (payload.data.fee_molam || 0),
                    totalCount: prev.totalCount + 1
                }));
            } else if (payload.type === "alert") {
                setAlerts(a => [payload.data, ...a].slice(0, 50));
            }
        });

        // Load initial alerts
        fetchAlerts();
        fetchKPIs();

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    const fetchAlerts = async () => {
        try {
            const token = localStorage.getItem("molam_token");
            const response = await fetch("/api/alerts/rules/alerts?resolved=false&limit=50", {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            setAlerts(data.alerts || []);
        } catch (error) {
            console.error("Failed to fetch alerts", error);
        }
    };

    const fetchKPIs = async () => {
        try {
            const token = localStorage.getItem("molam_token");
            const response = await fetch("/api/dashboard/overview", {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            // Aggregate KPI data from response
            // This is a simplified version - adjust based on actual API response
        } catch (error) {
            console.error("Failed to fetch KPIs", error);
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-6">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-semibold text-gray-900">Molam Real-Time Ops</h1>
                <div className="flex space-x-4">
                    <div className="bg-green-50 px-3 py-1 rounded-full text-sm text-green-700">
                        Live
                    </div>
                </div>
            </header>

            {/* KPI Cards */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-2xl p-6 border shadow-sm">
                    <div className="text-sm font-medium text-gray-500 uppercase">Volume Total</div>
                    <div className="text-2xl font-bold text-gray-900 mt-2">
                        ${kpiStats.totalVolume.toLocaleString()}
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-6 border shadow-sm">
                    <div className="text-sm font-medium text-gray-500 uppercase">Frais Molam</div>
                    <div className="text-2xl font-bold text-gray-900 mt-2">
                        ${kpiStats.totalFees.toLocaleString()}
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-6 border shadow-sm">
                    <div className="text-sm font-medium text-gray-500 uppercase">Transactions</div>
                    <div className="text-2xl font-bold text-gray-900 mt-2">
                        {kpiStats.totalCount.toLocaleString()}
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Live Feed" content={<LiveFeed rows={updates} />} />
                <Card title="Alertes" content={<AlertsPanel alerts={alerts} />} />
            </section>
        </div>
    );
}

function LiveFeed({ rows }: { rows: DashboardUpdate[] }) {
    return (
        <div className="bg-white rounded-2xl p-4 border shadow-sm max-h-80 overflow-auto">
            <ul className="space-y-2">
                {rows.map((row, i) => (
                    <li key={i} className="py-2 border-b last:border-b-0">
                        <div className="flex justify-between items-start">
                            <div className="text-sm font-medium text-gray-900">
                                {row.type}
                            </div>
                            <div className="text-xs text-gray-500">
                                {new Date().toLocaleTimeString()}
                            </div>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                            {JSON.stringify(row.data)}
                        </div>
                    </li>
                ))}
                {rows.length === 0 && (
                    <li className="text-center text-gray-500 py-4">
                        En attente des mises à jour en temps réel...
                    </li>
                )}
            </ul>
        </div>
    );
}

function AlertsPanel({ alerts }: { alerts: any[] }) {
    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'bg-red-100 text-red-800';
            case 'warn': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-blue-100 text-blue-800';
        }
    };

    return (
        <div className="bg-white rounded-2xl p-4 border shadow-sm max-h-80 overflow-auto">
            <ul className="space-y-2">
                {alerts.map((alert, i) => (
                    <li key={i} className="py-2 border-b last:border-b-0">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                                    {alert.severity}
                                </span>
                                <span className="text-sm font-medium text-gray-900">
                                    {alert.name || alert.alert_type}
                                </span>
                            </div>
                            <div className="text-xs text-gray-500">
                                {new Date(alert.created_at).toLocaleTimeString()}
                            </div>
                        </div>
                        {alert.payload && (
                            <div className="text-xs text-gray-600 mt-1">
                                {JSON.stringify(alert.payload)}
                            </div>
                        )}
                    </li>
                ))}
                {alerts.length === 0 && (
                    <li className="text-center text-gray-500 py-4">
                        Aucune alerte active
                    </li>
                )}
            </ul>
        </div>
    );
}

function Card({ title, content }: { title: string; content: any }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-4">
                <div className="text-lg font-semibold text-gray-900">{title}</div>
            </div>
            <div className="p-6">{content}</div>
        </div>
    );
}