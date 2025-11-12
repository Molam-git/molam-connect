import React, { useEffect, useState } from 'react';

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string;
  billing_interval: string;
  interval_count: number;
  currency: string;
  unit_amount: number;
  is_metered: boolean;
  trial_period_days: number;
}

interface Subscription {
  id: string;
  merchant_id: string;
  status: string;
  plan_snapshot: {
    slug: string;
    name: string;
    unit_amount: string;
    billing_interval: string;
    currency: string;
  };
  current_period_start: string;
  current_period_end: string;
  trial_end?: string;
  cancel_at_period_end: boolean;
  created_at: string;
}

export default function SubscriptionPortal() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string>('');

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    if (merchantId) {
      fetchSubscriptions();
    }
  }, [merchantId]);

  const fetchPlans = async () => {
    try {
      const response = await fetch('http://localhost:4067/api/subscriptions/plans/list');
      if (!response.ok) throw new Error('Failed to fetch plans');
      const data = await response.json();
      setPlans(data);
    } catch (err: any) {
      console.error('Error fetching plans:', err);
      setError(err.message);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:4067/api/subscriptions?merchant_id=${merchantId}`
      );
      if (!response.ok) throw new Error('Failed to fetch subscriptions');
      const data = await response.json();
      setSubscriptions(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching subscriptions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const subscribe = async (planId: string) => {
    const idempotencyKey = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const response = await fetch('http://localhost:4067/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          plan_id: planId,
          actor: 'merchant-user',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create subscription');
      }

      alert('Subscription created successfully!');
      fetchSubscriptions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const changePlan = async (subscriptionId: string) => {
    const newPlanId = prompt('Enter new plan ID:');
    if (!newPlanId) return;

    try {
      const response = await fetch(
        `http://localhost:4067/api/subscriptions/${subscriptionId}/change-plan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_plan_id: newPlanId,
            effective_immediately: false,
            actor: 'merchant-user',
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to change plan');

      alert('Plan change scheduled for next billing period!');
      fetchSubscriptions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const cancel = async (subscriptionId: string) => {
    const confirmCancel = window.confirm(
      'Are you sure you want to cancel this subscription at the end of the current period?'
    );

    if (!confirmCancel) return;

    try {
      const response = await fetch(
        `http://localhost:4067/api/subscriptions/${subscriptionId}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cancel_at_period_end: true,
            reason: 'User requested cancellation',
            actor: 'merchant-user',
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to cancel subscription');

      alert('Subscription will be canceled at the end of the billing period');
      fetchSubscriptions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      trialing: 'bg-blue-100 text-blue-800',
      past_due: 'bg-yellow-100 text-yellow-800',
      canceled: 'bg-red-100 text-red-800',
      unpaid: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Subscription Management</h1>
        <p className="text-gray-600 mt-2">Manage your subscription plans and billing</p>
      </div>

      {/* Merchant ID Input */}
      {!merchantId && (
        <div className="mb-6 bg-white shadow rounded-lg p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enter Merchant ID to view subscriptions
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="merchant-123"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  setMerchantId((e.target as HTMLInputElement).value);
                }
              }}
            />
            <button
              onClick={() => {
                const input = document.querySelector('input') as HTMLInputElement;
                setMerchantId(input.value);
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Load Subscriptions
            </button>
          </div>
        </div>
      )}

      {merchantId && (
        <section className="grid md:grid-cols-2 gap-6">
          {/* Available Plans */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Plans</h2>
            <div className="space-y-4">
              {plans.map((plan) => (
                <div key={plan.id} className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="font-bold text-lg text-gray-900">{plan.name}</div>
                      <div className="text-sm text-gray-600 mt-1">{plan.description}</div>
                      {plan.is_metered && (
                        <span className="inline-block mt-2 px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">
                          Usage-based
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">
                        {Number(plan.unit_amount).toFixed(2)} {plan.currency}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        per {plan.billing_interval}
                      </div>
                    </div>
                  </div>

                  {plan.trial_period_days > 0 && (
                    <div className="text-sm text-green-600 mb-3">
                      ✓ {plan.trial_period_days}-day free trial
                    </div>
                  )}

                  <button
                    onClick={() => subscribe(plan.id)}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    Subscribe Now
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* My Subscriptions */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">My Subscriptions</h2>

            {loading ? (
              <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
                Loading...
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                Error: {error}
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
                No active subscriptions
              </div>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="bg-white shadow rounded-lg p-6">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold text-lg text-gray-900">
                          {sub.plan_snapshot.name}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {sub.plan_snapshot.slug}
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(
                          sub.status
                        )}`}
                      >
                        {sub.status}
                      </span>
                    </div>

                    <div className="text-sm text-gray-600 mb-3">
                      <div>
                        Period: {new Date(sub.current_period_start).toLocaleDateString()} →{' '}
                        {new Date(sub.current_period_end).toLocaleDateString()}
                      </div>
                      {sub.trial_end && (
                        <div className="text-blue-600 mt-1">
                          Trial ends: {new Date(sub.trial_end).toLocaleDateString()}
                        </div>
                      )}
                      {sub.cancel_at_period_end && (
                        <div className="text-red-600 mt-1">
                          ⚠️ Will be canceled at period end
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => changePlan(sub.id)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                        disabled={sub.status === 'canceled'}
                      >
                        Change Plan
                      </button>
                      <button
                        onClick={() => cancel(sub.id)}
                        className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
                        disabled={sub.status === 'canceled' || sub.cancel_at_period_end}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}