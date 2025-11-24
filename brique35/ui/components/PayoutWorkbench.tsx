import React, { useState, useEffect } from 'react';
import { usePayouts } from '../hooks/usePayouts';

export const PayoutWorkbench: React.FC = () => {
    const { payouts, loading, error, fetchPayouts, approvePayout } = usePayouts();
    const [filters, setFilters] = useState({ status: '', originModule: '' });

    useEffect(() => {
        fetchPayouts(filters);
    }, [filters]);

    const handleApprove = async (payoutId: string) => {
        try {
            await approvePayout(payoutId, 'approved', 'Approved via UI');
            fetchPayouts(filters); // Rafraîchir la liste
        } catch (err) {
            console.error('Approval failed:', err);
        }
    };

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div>
            <h1>Payout Workbench</h1>
            <div>
                <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="processing">Processing</option>
                    <option value="sent">Sent</option>
                    <option value="settled">Settled</option>
                    <option value="failed">Failed</option>
                </select>
                <select
                    value={filters.originModule}
                    onChange={(e) => setFilters({ ...filters, originModule: e.target.value })}
                >
                    <option value="">All Modules</option>
                    <option value="shop">Shop</option>
                    <option value="agent">Agent</option>
                    <option value="user">User</option>
                </select>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Reference</th>
                        <th>Amount</th>
                        <th>Currency</th>
                        <th>Status</th>
                        <th>Origin</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {payouts.map((payout) => (
                        <tr key={payout.id}>
                            <td>{payout.reference_code}</td>
                            <td>{payout.amount}</td>
                            <td>{payout.currency}</td>
                            <td>{payout.status}</td>
                            <td>{payout.origin_module}</td>
                            <td>
                                {payout.status === 'pending_approval' && (
                                    <button onClick={() => handleApprove(payout.id)}>Approve</button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};