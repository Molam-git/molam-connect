import React, { useState, useEffect } from 'react';
import { CreatePlanWizard } from './components/CreatePlanWizard';
import { ApprovalPanel } from './components/ApprovalPanel';
import { ExecutionView } from './components/ExecutionView';
import { OrdersJournal } from './components/OrdersJournal';
import { Plan, MolamUser } from './types';

export function OpsConsole() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [activeView, setActiveView] = useState<'list' | 'detail' | 'create' | 'journal'>('list');
  const [currentUser] = useState<MolamUser>({
    id: 'user-123',
    roles: ['ops_user'],
    zone: 'SN-DKR',
    mfa: true
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/ops?limit=50');
      const data = await response.json();
      setPlans(data);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };

  const handlePlanCreated = (newPlan: Plan) => {
    setPlans(prev => [newPlan, ...prev]);
    setActiveView('list');
  };

  const handleApprove = async (planId: string, decision: string, note: string) => {
    try {
      await fetch(`/api/ops/${planId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note })
      });
      fetchPlans(); // Refresh the list
    } catch (error) {
      console.error('Failed to submit approval:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      draft: 'text-gray-500',
      pending_approval: 'text-yellow-600',
      approved: 'text-blue-600',
      executing: 'text-purple-600',
      completed: 'text-green-600',
      failed: 'text-red-600',
      rolledback: 'text-orange-600'
    };
    return colors[status] || 'text-gray-500';
  };

  const getSeverityColor = (severity: string) => {
    const colors: { [key: string]: string } = {
      LOW: 'text-green-600 bg-green-100',
      MEDIUM: 'text-yellow-600 bg-yellow-100',
      HIGH: 'text-orange-600 bg-orange-100',
      CRITICAL: 'text-red-600 bg-red-100'
    };
    return colors[severity] || 'text-gray-500 bg-gray-100';
  };

  if (activeView === 'create') {
    return <CreatePlanWizard onCancel={() => setActiveView('list')} onSuccess={handlePlanCreated} />;
  }

  if (activeView === 'detail' && selectedPlan) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <button 
          onClick={() => setActiveView('list')}
          className="mb-4 flex items-center text-blue-600 hover:text-blue-800"
        >
          ← Back to list
        </button>
        <ExecutionView plan={selectedPlan} />
      </div>
    );
  }

  if (activeView === 'journal') {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <button 
          onClick={() => setActiveView('list')}
          className="mb-4 flex items-center text-blue-600 hover:text-blue-800"
        >
          ← Back to list
        </button>
        <OrdersJournal onPlanSelect={(plan) => {
          setSelectedPlan(plan);
          setActiveView('detail');
        }} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Molam Ops</h1>
          <p className="text-gray-600 mt-1">Generate and execute operational plans</p>
        </div>
        <div className="flex gap-3">
          <button 
            className="btn-apple-secondary"
            onClick={() => setActiveView('journal')}
          >
            Orders Journal
          </button>
          <button 
            className="btn-apple-primary"
            onClick={() => setActiveView('create')}
          >
            New Plan
          </button>
        </div>
      </header>

      <main className="space-y-6">
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-medium text-gray-900">Recent Plans</h2>
            <div className="flex gap-2">
              <select className="text-sm border border-gray-200 rounded-lg px-3 py-1">
                <option>All Status</option>
                <option>Pending Approval</option>
                <option>Executing</option>
                <option>Completed</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {plans.map(plan => (
              <div 
                key={plan.id} 
                className="p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedPlan(plan);
                  setActiveView('detail');
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-gray-900">{plan.title}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(plan.severity)}`}>
                        {plan.severity}
                      </span>
                      <span className={`text-sm font-medium ${getStatusColor(plan.status)}`}>
                        {plan.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{plan.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Created: {new Date(plan.created_at).toLocaleDateString()}</span>
                      <span>Approvals: {plan.approvals?.length || 0}/{plan.required_approvals}</span>
                      {plan.scope && (
                        <span>Scope: {plan.scope.type} - {plan.scope.id}</span>
                      )}
                    </div>
                  </div>
                  <button className="btn-ghost text-sm">Open</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}