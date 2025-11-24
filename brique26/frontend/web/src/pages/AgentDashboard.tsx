import React, { useEffect, useState } from "react";

type AgentStats = {
    id: number;
    name: string;
    location: string;
    total_sales: number;
    total_commissions: number;
    transactions_count: number;
    status: 'active' | 'inactive';
    last_activity: string;
};

type Transaction = {
    id: number;
    agent_name: string;
    type: 'cash_in' | 'cash_out' | 'p2p' | 'merchant';
    amount: number;
    currency: string;
    status: 'completed' | 'pending' | 'failed';
    created_at: string;
};

export default function AgentDashboard() {
    const [agents, setAgents] = useState<AgentStats[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [timeRange, setTimeRange] = useState('today');

    useEffect(() => {
        refreshData();
    }, [timeRange]);

    async function refreshData() {
        setLoading(true);
        try {
            // Simuler l'appel API pour les agents
            const mockAgents: AgentStats[] = [
                {
                    id: 1,
                    name: "Agent Dakar Centre",
                    location: "Dakar, Plateau",
                    total_sales: 4500000,
                    total_commissions: 45000,
                    transactions_count: 156,
                    status: 'active',
                    last_activity: '2024-01-15T14:30:00Z'
                },
                {
                    id: 2,
                    name: "Agent Dakar Medina",
                    location: "Dakar, Medina",
                    total_sales: 3200000,
                    total_commissions: 32000,
                    transactions_count: 134,
                    status: 'active',
                    last_activity: '2024-01-15T13:45:00Z'
                },
                {
                    id: 3,
                    name: "Agent Thies Central",
                    location: "Thies, Centre Ville",
                    total_sales: 2800000,
                    total_commissions: 28000,
                    transactions_count: 98,
                    status: 'active',
                    last_activity: '2024-01-15T12:15:00Z'
                }
            ];

            // Simuler l'appel API pour les transactions
            const mockTransactions: Transaction[] = [
                {
                    id: 1,
                    agent_name: "Agent Dakar Centre",
                    type: "cash_in",
                    amount: 50000,
                    currency: "XOF",
                    status: "completed",
                    created_at: "2024-01-15T14:30:00Z"
                },
                {
                    id: 2,
                    agent_name: "Agent Dakar Medina",
                    type: "cash_out",
                    amount: 25000,
                    currency: "XOF",
                    status: "completed",
                    created_at: "2024-01-15T14:25:00Z"
                },
                {
                    id: 3,
                    agent_name: "Agent Thies Central",
                    type: "p2p",
                    amount: 15000,
                    currency: "XOF",
                    status: "pending",
                    created_at: "2024-01-15T14:20:00Z"
                }
            ];

            setAgents(mockAgents);
            setTransactions(mockTransactions);
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    }

    const totalSales = agents.reduce((sum, agent) => sum + agent.total_sales, 0);
    const totalCommissions = agents.reduce((sum, agent) => sum + agent.total_commissions, 0);
    const totalTransactions = agents.reduce((sum, agent) => sum + agent.transactions_count, 0);

    return (
        <div className="min-h-screen bg-white text-gray-900">
            <header className="p-6 shadow sticky top-0 bg-white/80 backdrop-blur">
                <h1 className="text-2xl font-semibold">Molam • Agent Dashboard</h1>
                <p className="text-sm opacity-70">Monitor agent performance and transactions</p>
            </header>

            <main className="p-6 grid gap-6">
                {/* KPI Cards */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-2xl shadow-sm">
                        <h3 className="text-sm font-medium text-blue-800">Total Sales</h3>
                        <p className="text-2xl font-bold text-blue-600">{fmt(totalSales)} XOF</p>
                        <p className="text-xs text-blue-600 mt-1">All agents {timeRange}</p>
                    </div>

                    <div className="bg-green-50 p-4 rounded-2xl shadow-sm">
                        <h3 className="text-sm font-medium text-green-800">Total Commissions</h3>
                        <p className="text-2xl font-bold text-green-600">{fmt(totalCommissions)} XOF</p>
                        <p className="text-xs text-green-600 mt-1">Commission revenue</p>
                    </div>

                    <div className="bg-purple-50 p-4 rounded-2xl shadow-sm">
                        <h3 className="text-sm font-medium text-purple-800">Total Transactions</h3>
                        <p className="text-2xl font-bold text-purple-600">{fmt(totalTransactions)}</p>
                        <p className="text-xs text-purple-600 mt-1">Transaction count</p>
                    </div>
                </section>

                {/* Time Range Filter */}
                <section className="flex gap-2">
                    {['today', 'week', 'month', 'quarter'].map((range) => (
                        <button
                            key={range}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${timeRange === range
                                    ? 'bg-black text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            onClick={() => setTimeRange(range)}
                        >
                            {range.charAt(0).toUpperCase() + range.slice(1)}
                        </button>
                    ))}
                </section>

                {/* Agents List */}
                <section className="bg-gray-50 p-4 rounded-2xl shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-lg font-medium">Agents Performance</h2>
                        <button
                            className="px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50"
                            onClick={refreshData}
                            disabled={loading}
                        >
                            {loading ? "Refreshing..." : "Refresh"}
                        </button>
                    </div>

                    <table className="w-full text-sm">
                        <thead className="border-b text-left">
                            <tr>
                                <th className="py-2">Agent Name</th>
                                <th>Location</th>
                                <th>Total Sales</th>
                                <th>Commissions</th>
                                <th>Transactions</th>
                                <th>Status</th>
                                <th>Last Activity</th>
                            </tr>
                        </thead>
                        <tbody>
                            {agents.map((agent) => (
                                <tr key={agent.id} className="border-b last:border-0">
                                    <td className="py-2 font-medium">{agent.name}</td>
                                    <td>{agent.location}</td>
                                    <td>{fmt(agent.total_sales)} XOF</td>
                                    <td>{fmt(agent.total_commissions)} XOF</td>
                                    <td>{fmt(agent.transactions_count)}</td>
                                    <td>
                                        <span
                                            className={`px-2 py-1 rounded-xl text-xs ${agent.status === 'active'
                                                    ? 'bg-green-100 text-green-600'
                                                    : 'bg-red-100 text-red-600'
                                                }`}
                                        >
                                            {agent.status}
                                        </span>
                                    </td>
                                    <td className="text-xs text-gray-500">
                                        {new Date(agent.last_activity).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                {/* Recent Transactions */}
                <section className="bg-gray-50 p-4 rounded-2xl shadow-sm">
                    <h2 className="text-lg font-medium mb-3">Recent Transactions</h2>
                    <table className="w-full text-sm">
                        <thead className="border-b text-left">
                            <tr>
                                <th className="py-2">Agent</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((tx) => (
                                <tr key={tx.id} className="border-b last:border-0">
                                    <td className="py-2">{tx.agent_name}</td>
                                    <td>
                                        <span className={`px-2 py-1 rounded-xl text-xs ${tx.type === 'cash_in' ? 'bg-blue-100 text-blue-600' :
                                                tx.type === 'cash_out' ? 'bg-orange-100 text-orange-600' :
                                                    'bg-purple-100 text-purple-600'
                                            }`}>
                                            {tx.type.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>{fmt(tx.amount)} {tx.currency}</td>
                                    <td>
                                        <span className={`px-2 py-1 rounded-xl text-xs ${tx.status === 'completed' ? 'bg-green-100 text-green-600' :
                                                tx.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                                                    'bg-red-100 text-red-600'
                                            }`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                    <td className="text-xs text-gray-500">
                                        {new Date(tx.created_at).toLocaleString()}
                                    </td>
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