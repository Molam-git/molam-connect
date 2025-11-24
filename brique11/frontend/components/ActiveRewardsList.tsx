import { useState, useEffect } from 'react';

interface ActiveReward {
    id: string;
    type: 'cashback' | 'voucher' | 'points';
    name: { [key: string]: string };
    description?: { [key: string]: string };
    percentage?: number;
    reward_value?: number;
    min_transaction?: number;
    max_reward?: number;
    valid_until: string;
    sponsor?: string;
}

export default function ActiveRewardsList() {
    const [rewards, setRewards] = useState<ActiveReward[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchActiveRewards();
    }, []);

    const fetchActiveRewards = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/pay/rewards/active?currency=USD');
            if (!response.ok) throw new Error('Failed to fetch active rewards');
            const data = await response.json();
            setRewards(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="p-4 bg-white rounded-2xl shadow">
                <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-gray-200 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                <p className="text-red-600 mb-4">Error loading rewards: {error}</p>
                <button
                    onClick={fetchActiveRewards}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-xl font-bold mb-4">Available Rewards</h2>

            {rewards.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    No active rewards available at the moment
                </div>
            ) : (
                <div className="space-y-4">
                    {rewards.map((reward) => (
                        <div key={reward.id} className="p-4 border rounded-lg">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-lg">
                                            {reward.type === 'cashback' ? '💰' :
                                                reward.type === 'voucher' ? '🎫' : '⭐'}
                                        </span>
                                        <h3 className="font-bold">
                                            {reward.name.en || reward.name.fr || 'Reward'}
                                        </h3>
                                    </div>

                                    {reward.description && (
                                        <p className="text-gray-600 text-sm mb-2">
                                            {reward.description.en || reward.description.fr}
                                        </p>
                                    )}

                                    <div className="flex flex-wrap gap-2 text-sm">
                                        {reward.percentage && (
                                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                                                {reward.percentage}% Cashback
                                            </span>
                                        )}
                                        {reward.reward_value && reward.type === 'points' && (
                                            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                                                {reward.reward_value} points
                                            </span>
                                        )}
                                        {reward.min_transaction && (
                                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                                Min: {reward.min_transaction} USD
                                            </span>
                                        )}
                                        {reward.sponsor && (
                                            <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                                                Sponsor: {reward.sponsor}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="text-right text-sm text-gray-500">
                                    Valid until {new Date(reward.valid_until).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}