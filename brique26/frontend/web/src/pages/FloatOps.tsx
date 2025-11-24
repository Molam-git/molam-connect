import React, { useEffect, useState } from "react";

type Position = {
    id: number;
    entity: string;
    country: string;
    currency: string;
    balance: number;
    available: number;
    threshold: number;
    status: string;
};

type Order = {
    id: number;
    from_entity: string;
    to_entity: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
};

export default function FloatOps() {
    const [positions, setPositions] = useState<Position[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        refresh();
    }, []);

    async function refresh() {
        try {
            const posRes = await fetch("/api/float/positions");
            const posData = await posRes.json();
            setPositions(posData.rows || []);

            const ordRes = await fetch("/api/float/orders");
            const ordData = await ordRes.json();
            setOrders(ordData.rows || []);
        } catch (error) {
            console.error("Refresh failed:", error);
        }
    }

    async function generatePlan() {
        setLoading(true);
        try {
            await fetch("/api/float/plan", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country: 'SN', currency: 'XOF', horizon_min: 60 })
            });
            await refresh();
        } catch (error) {
            console.error("Generate plan failed:", error);
        } finally {
            setLoading(false);
        }
    }

    async function executePlan() {
        setLoading(true);
        try {
            // Récupérer le dernier plan non exécuté
            const plansRes = await fetch("/api/float/plans?status=planned");
            const plansData = await plansRes.json();

            if (plansData.rows.length > 0) {
                const latestPlan = plansData.rows[0];
                await fetch("/api/float/execute", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plan_id: latestPlan.plan_id })
                });
            }
            await refresh();
        } catch (error) {
            console.error("Execute plan failed:", error);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-white text-gray-900">
            <header className="p-6 shadow sticky top-0 bg-white/80 backdrop-blur">
                <h1 className="text-2xl font-semibold">Molam • Float Ops</h1>
                <p className="text-sm opacity-70">Manage liquidity across banks & agents</p>
            </header>

            <main className="p-6 grid gap-6">
                {/* Positions critiques */}
                <section className="bg-gray-50 p-4 rounded-2xl shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-lg font-medium">Critical Positions</h2>
                        <div className="flex gap-2">
                            <button
                                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
                                onClick={generatePlan}
                                disabled={loading}
                            >
                                {loading ? "Generating..." : "Generate Plan"}
                            </button>
                            <button
                                className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50"
                                onClick={executePlan}
                                disabled={loading}
                            >
                                {loading ? "Executing..." : "Execute Plan"}
                            </button>
                        </div>
                    </div>
                    <table className="w-full text-sm">
                        <thead className="border-b text-left">
                            <tr>
                                <th className="py-2">Entity</th>
                                <th>Country</th>
                                <th>Currency</th>
                                <th>Balance</th>
                                <th>Available</th>
                                <th>Threshold</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map((p, i) => (
                                <tr key={i} className="border-b last:border-0">
                                    <td className="py-2">{p.entity}</td>
                                    <td>{p.country}</td>
                                    <td>{p.currency}</td>
                                    <td>{fmt(p.balance)}</td>
                                    <td>{fmt(p.available)}</td>
                                    <td>{fmt(p.threshold)}</td>
                                    <td>
                                        <span
                                            className={`px-2 py-1 rounded-xl text-xs ${p.status === "critical"
                                                    ? "bg-red-100 text-red-600"
                                                    : "bg-green-100 text-green-600"
                                                }`}
                                        >
                                            {p.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                {/* Journal des ordres */}
                <section className="bg-gray-50 p-4 rounded-2xl shadow-sm">
                    <h2 className="text-lg font-medium mb-3">Orders Log</h2>
                    <table className="w-full text-sm">
                        <thead className="border-b text-left">
                            <tr>
                                <th className="py-2">From → To</th>
                                <th>Amount</th>
                                <th>Currency</th>
                                <th>Status</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((o, i) => (
                                <tr key={i} className="border-b last:border-0">
                                    <td className="py-2">{o.from_entity} → {o.to_entity}</td>
                                    <td>{fmt(o.amount)}</td>
                                    <td>{o.currency}</td>
                                    <td>
                                        <span className={`px-2 py-1 rounded-xl text-xs ${o.status === 'planned' ? 'bg-yellow-100 text-yellow-600' :
                                                o.status === 'sent' ? 'bg-blue-100 text-blue-600' :
                                                    o.status === 'confirmed' ? 'bg-green-100 text-green-600' :
                                                        'bg-red-100 text-red-600'
                                            }`}>
                                            {o.status}
                                        </span>
                                    </td>
                                    <td>{new Date(o.created_at).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </main>
        </div>
    );
}

function fmt(n: number) {
    return new Intl.NumberFormat().format(n || 0);
}