import { useState } from 'react';
import RewardsPanel from '../components/RewardsPanel';
import ActiveRewardsList from '../components/ActiveRewardsList';

export default function RewardsPage() {
    const [activeTab, setActiveTab] = useState<'my-rewards' | 'available'>('my-rewards');

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Molam Rewards</h1>
                    <p className="text-gray-600">Earn cashback, vouchers and loyalty points on every transaction</p>
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-gray-200 mb-6">
                    <button
                        onClick={() => setActiveTab('my-rewards')}
                        className={`flex-1 py-3 font-medium text-center ${activeTab === 'my-rewards'
                                ? 'border-b-2 border-green-500 text-green-600'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        My Rewards
                    </button>
                    <button
                        onClick={() => setActiveTab('available')}
                        className={`flex-1 py-3 font-medium text-center ${activeTab === 'available'
                                ? 'border-b-2 border-green-500 text-green-600'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Available Offers
                    </button>
                </div>

                {/* Content */}
                {activeTab === 'my-rewards' && <RewardsPanel />}
                {activeTab === 'available' && <ActiveRewardsList />}
            </div>
        </div>
    );
}