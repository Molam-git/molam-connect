// ui-ops/src/components/TreasuryDashboard.tsx
import React, { useState, useEffect } from 'react';

interface FloatData {
    currency: string;
    balance: number;
    reserved: number;
    available: number;
}

export const TreasuryDashboard: React.FC = () => {
    const [floatData, setFloatData] = useState<FloatData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFloatData();
    }, []);

    const fetchFloatData = async () => {
        try {
            // Simulation de données
            setFloatData([
                { currency: 'XOF', balance: 1500000, reserved: 500000, available: 1000000 },
                { currency: 'USD', balance: 750000, reserved: 250000, available: 500000 },
                { currency: 'EUR', balance: 450000, reserved: 150000, available: 300000 }
            ]);
        } catch (error) {
            console.error('Error fetching float data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading treasury data...</div>;

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Treasury Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {floatData.map(data => (
                    <div key={data.currency} className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-xl font-semibold mb-4">{data.currency} Float</h2>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span>Balance:</span>
                                <span className="font-medium">{data.balance.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Reserved:</span>
                                <span className="text-yellow-600">{data.reserved.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Available:</span>
                                <span className="text-green-600">{data.available.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
                <div className="flex gap-4">
                    <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                        Generate Float Plan
                    </button>
                    <button className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
                        Execute Sweep
                    </button>
                    <button className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
                        Emergency Pause
                    </button>
                </div>
            </div>
        </div>
    );
};