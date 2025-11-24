import React, { useState, useEffect } from "react";

interface RewardBalance {
    cashback: string;
    vouchers: Array<{
        code: string;
        value: string;
        valid_until: string;
        reward_name: any;
    }>;
    points: number;
}

export default function RewardsPanel() {
    const [rewards, setRewards] = useState<RewardBalance | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [converting, setConverting] = useState(false);

    useEffect(() => {
        fetchRewardsBalance();
    }, []);

    const fetchRewardsBalance = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/pay/rewards/balance?user_id=me");
            if (!response.ok) throw new Error('Failed to fetch rewards');
            const data = await response.json();
            setRewards(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const convertCashback = async (amount: number) => {
        try {
            setConverting(true);
            const response = await fetch("/api/pay/rewards/convert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: "me", // À remplacer par l'ID utilisateur réel
                    reward_type: "cashback",
                    amount: amount,
                    target: "wallet"
                })
            });

            if (!response.ok) throw new Error('Conversion failed');

            const result = await response.json();
            alert(`Success: ${result.wallet_credit} credited to your wallet`);
            await fetchRewardsBalance(); // Rafraîchir le solde
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Conversion error');
        } finally {
            setConverting(false);
        }
    };

    if (loading) return (
        <div className="p-4 bg-white rounded-2xl shadow">
            <div className="animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
        </div>
    );

    if (error) return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-red-600">Error loading rewards: {error}</p>
            <button
                onClick={fetchRewardsBalance}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
                Retry
            </button>
        </div>
    );

    if (!rewards) return null;

    return (
        <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-100">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">My Rewards</h2>

            {/* Cashback Section */}
            <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-700">Cashback</h3>
                        <p className="text-2xl font-bold text-green-600">{rewards.cashback}</p>
                    </div>
                    <button
                        onClick={() => {
                            const amount = parseFloat(rewards.cashback.split(' ')[0]);
                            if (amount > 0) convertCashback(amount);
                        }}
                        disabled={converting || parseFloat(rewards.cashback.split(' ')[0]) <= 0}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {converting ? 'Converting...' : 'Convert to Wallet'}
                    </button>
                </div>
            </div>

            {/* Points Section */}
            <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Loyalty Points</h3>
                <div className="flex justify-between items-center">
                    <p className="text-2xl font-bold text-purple-600">{rewards.points} pts</p>
                    <span className="text-sm text-gray-500">Convertible to vouchers</span>
                </div>
            </div>

            {/* Vouchers Section */}
            {rewards.vouchers.length > 0 && (
                <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-700 mb-3">My Vouchers</h3>
                    <div className="space-y-3">
                        {rewards.vouchers.map((voucher) => (
                            <div key={voucher.code} className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-mono font-bold text-lg text-yellow-700">{voucher.code}</p>
                                        <p className="text-yellow-600 font-semibold">{voucher.value}</p>
                                        <p className="text-sm text-gray-500">
                                            Valid until {new Date(voucher.valid_until).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <span className="px-2 py-1 bg-yellow-200 text-yellow-800 text-xs rounded-full">
                                        Available
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {rewards.vouchers.length === 0 && (
                <div className="text-center py-4 text-gray-500">
                    No active vouchers
                </div>
            )}
        </div>
    );
}