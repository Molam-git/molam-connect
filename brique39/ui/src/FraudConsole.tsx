import React, { useEffect, useState } from "react";

interface FraudAlert {
    id: string;
    entity_type: string;
    entity_id: string;
    score: number;
    created_at: string;
    decision: {
        action: string;
        reason: string;
    };
}

export default function FraudConsole() {
    const [alerts, setAlerts] = useState<FraudAlert[]>([]);

    useEffect(() => {
        fetchAlerts();
    }, []);

    const fetchAlerts = async () => {
        try {
            const response = await fetch("/api/fraud/alerts");
            const data = await response.json();
            setAlerts(data);
        } catch (error) {
            console.error("Failed to fetch alerts:", error);
        }
    };

    const handleAction = async (alertId: string, action: string) => {
        try {
            await fetch(`/api/fraud/alerts/${alertId}/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            fetchAlerts();
        } catch (error) {
            console.error("Failed to execute action:", error);
        }
    };

    return (
        <div className="min-h-screen bg-white text-gray-900 p-6">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-semibold">Molam • Fraud Console</h1>
                <div className="text-sm text-gray-500">Env: production</div>
            </header>

            <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <section className="col-span-2 bg-white rounded-xl p-6 shadow border">
                    <h2 className="text-lg font-medium mb-4">Real-time Alerts</h2>
                    <ul className="divide-y">
                        {alerts.map(alert => (
                            <li key={alert.id} className="py-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="font-medium">
                                            {alert.entity_type} • {alert.entity_id}
                                        </div>
                                        <div className="text-sm text-gray-500 mt-1">
                                            {new Date(alert.created_at).toLocaleString()}
                                        </div>
                                        <div className="flex items-center gap-4 mt-2">
                                            <div className="text-sm">
                                                Score: <span className="font-medium">{alert.score.toFixed(4)}</span>
                                            </div>
                                            <div className="text-sm">
                                                Action: <span className="font-medium">{alert.decision.action}</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-600 mt-1">
                                            Reason: {alert.decision.reason}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        <button
                                            onClick={() => handleAction(alert.id, "hold")}
                                            className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                                        >
                                            Hold
                                        </button>
                                        <button
                                            onClick={() => handleAction(alert.id, "release")}
                                            className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200"
                                        >
                                            Release
                                        </button>
                                        <button
                                            onClick={() => handleAction(alert.id, "review")}
                                            className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                                        >
                                            Review
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                <aside className="bg-white rounded-xl p-6 shadow border">
                    <h3 className="font-medium mb-4">Model Status</h3>
                    <div className="space-y-2 text-sm">
                        <div>Version: v1.0</div>
                        <div>AUC: 0.92</div>
                        <div>Drift: OK</div>
                        <div>Last Training: 2025-01-15</div>
                    </div>
                    <button className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Retrain Now
                    </button>
                </aside>
            </main>
        </div>
    );
}