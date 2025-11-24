import React, { useState, useEffect } from 'react';

interface PayoutEvent {
    id: string;
    event_type: string;
    payload: any;
    actor: string;
    created_at: string;
}

interface Payout {
    created_at: string | number | Date;
    id: string;
    reference_code: string;
    amount: number;
    currency: string;
    status: string;
    origin_module: string;
    events: PayoutEvent[];
}

export const JournalView: React.FC = () => {
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState({
        status: '',
        origin_module: '',
        date_from: '',
        date_to: ''
    });

    const fetchPayouts = async () => {
        setLoading(true);
        setError(null);

        try {
            const queryParams = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) queryParams.append(key, value);
            });

            const response = await fetch(`/api/treasury/payouts?${queryParams}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setPayouts(data);
        } catch (err) {
            // Gestion sécurisée du type unknown
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPayouts();
    }, []);

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleApplyFilters = () => {
        fetchPayouts();
    };

    if (loading) return <div className="journal-loading">Loading journal entries...</div>;

    if (error) return <div className="journal-error">Error: {error}</div>;

    return (
        <div className="journal-view">
            <h1>Payout Journal</h1>

            {/* Filtres */}
            <div className="journal-filters">
                <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="sent">Sent</option>
                    <option value="settled">Settled</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                </select>

                <select
                    value={filters.origin_module}
                    onChange={(e) => handleFilterChange('origin_module', e.target.value)}
                >
                    <option value="">All Modules</option>
                    <option value="shop">Shop</option>
                    <option value="agent">Agent</option>
                    <option value="user">User</option>
                </select>

                <input
                    type="date"
                    value={filters.date_from}
                    onChange={(e) => handleFilterChange('date_from', e.target.value)}
                    placeholder="From date"
                />

                <input
                    type="date"
                    value={filters.date_to}
                    onChange={(e) => handleFilterChange('date_to', e.target.value)}
                    placeholder="To date"
                />

                <button onClick={handleApplyFilters}>Apply Filters</button>
            </div>

            {/* Tableau des payouts */}
            <div className="journal-table">
                <table>
                    <thead>
                        <tr>
                            <th>Reference</th>
                            <th>Amount</th>
                            <th>Currency</th>
                            <th>Status</th>
                            <th>Origin</th>
                            <th>Created</th>
                            <th>Events</th>
                        </tr>
                    </thead>
                    <tbody>
                        {payouts.map((payout) => (
                            <tr key={payout.id}>
                                <td>{payout.reference_code}</td>
                                <td>{payout.amount}</td>
                                <td>{payout.currency}</td>
                                <td>
                                    <span className={`status-${payout.status}`}>
                                        {payout.status}
                                    </span>
                                </td>
                                <td>{payout.origin_module}</td>
                                <td>{new Date(payout.created_at).toLocaleDateString()}</td>
                                <td>
                                    <details>
                                        <summary>{payout.events?.length || 0} events</summary>
                                        <div className="events-list">
                                            {payout.events?.map((event) => (
                                                <div key={event.id} className="event-item">
                                                    <strong>{event.event_type}</strong>
                                                    <span>{new Date(event.created_at).toLocaleString()}</span>
                                                    {event.actor && <span>Actor: {event.actor}</span>}
                                                    {event.payload && (
                                                        <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {payouts.length === 0 && (
                    <div className="no-data">No payouts found</div>
                )}
            </div>
        </div>
    );
};