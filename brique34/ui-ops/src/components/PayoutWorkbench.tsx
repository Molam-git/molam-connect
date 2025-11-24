// ui-ops/src/components/PayoutWorkbench.tsx
import React, { useState, useEffect } from 'react';

interface Payout {
    id: string;
    reference_code: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
}

export const PayoutWorkbench: React.FC = () => {
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        fetchPayouts();
    }, [filter]);

    const fetchPayouts = async () => {
        try {
            // Simulation de données
            setPayouts([
                {
                    id: '1',
                    reference_code: 'PAYOUT-2024-01-15-ABC123',
                    amount: 150000,
                    currency: 'XOF',
                    status: 'pending',
                    created_at: '2024-01-15T10:30:00Z'
                },
                {
                    id: '2',
                    reference_code: 'PAYOUT-2024-01-15-DEF456',
                    amount: 2500,
                    currency: 'USD',
                    status: 'sent',
                    created_at: '2024-01-15T09:15:00Z'
                }
            ]);
        } catch (error) {
            console.error('Error fetching payouts:', error);
        }
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending: 'bg-yellow-100 text-yellow-800',
            sent: 'bg-blue-100 text-blue-800',
            settled: 'bg-green-100 text-green-800',
            failed: 'bg-red-100 text-red-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Payout Workbench</h1>

            <div className="mb-6 flex gap-4">
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="border rounded px-3 py-2"
                >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="sent">Sent</option>
                    <option value="settled">Settled</option>
                    <option value="failed">Failed</option>
                </select>

                <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                    Export CSV
                </button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Reference
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Amount
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Created
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {payouts.map(payout => (
                            <tr key={payout.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {payout.reference_code}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {payout.amount.toLocaleString()} {payout.currency}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(payout.status)}`}>
                                        {payout.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {new Date(payout.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button className="text-blue-600 hover:text-blue-900 mr-3">
                                        Retry
                                    </button>
                                    <button className="text-red-600 hover:text-red-900">
                                        Reverse
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};