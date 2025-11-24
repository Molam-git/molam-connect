import React, { useState } from 'react';
import { Plan, Action } from '../types';

interface CreatePlanWizardProps {
    onCancel: () => void;
    onSuccess: (plan: Plan) => void;
}

export function CreatePlanWizard({ onCancel, onSuccess }: CreatePlanWizardProps) {
    const [step, setStep] = useState(1);
    const [plan, setPlan] = useState<Partial<Plan>>({
        title: '',
        description: '',
        severity: 'MEDIUM',
        scope: { type: '', id: '' },
        actions: []
    });

    const [currentAction, setCurrentAction] = useState<Partial<Action>>({
        name: '',
        params: {}
    });

    const availableActions = [
        { name: 'freeze_payouts', label: 'Freeze Payouts', params: ['zone', 'reason'] },
        { name: 'pause_partner', label: 'Pause Partner', params: ['partner_id', 'reason'] },
        { name: 'update_feature_flag', label: 'Update Feature Flag', params: ['flag', 'value'] },
        { name: 'notify_partner', label: 'Notify Partner', params: ['partner_id', 'message'] },
        { name: 'set_agent_commission', label: 'Set Agent Commission', params: ['agent_id', 'commission_pct'] }
    ];

    const handleAddAction = () => {
        if (currentAction.name && currentAction.params) {
            setPlan(prev => ({
                ...prev,
                actions: [...(prev.actions || []), { name: currentAction.name!, params: currentAction.params }]
            }));
            setCurrentAction({ name: '', params: {} });
        }
    };

    const handleSubmit = async () => {
        try {
            const response = await fetch('/api/ops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(plan)
            });

            if (response.ok) {
                const newPlan = await response.json();
                onSuccess(newPlan);
            } else {
                console.error('Failed to create plan');
            }
        } catch (error) {
            console.error('Failed to create plan:', error);
        }
    };

    const updateActionParam = (paramName: string, value: string) => {
        setCurrentAction(prev => ({
            ...prev,
            params: {
                ...prev.params,
                [paramName]: value
            }
        }));
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-2xl font-semibold text-gray-900">Create New Plan</h2>
                    <div className="flex gap-2 mt-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className={`flex-1 h-2 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-gray-200'
                                }`} />
                        ))}
                    </div>
                </div>

                <div className="p-6">
                    {step === 1 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Plan Details</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={plan.title}
                                    onChange={e => setPlan(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="e.g., Freeze payouts for SN-DKR"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    rows={3}
                                    value={plan.description}
                                    onChange={e => setPlan(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Describe the purpose and context of this plan..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Severity *</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={plan.severity}
                                    onChange={e => setPlan(prev => ({ ...prev, severity: e.target.value }))}
                                >
                                    <option value="LOW">Low</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HIGH">High</option>
                                    <option value="CRITICAL">Critical</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                                <div className="flex gap-2">
                                    <select
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        value={plan.scope?.type || ''}
                                        onChange={e => setPlan(prev => ({
                                            ...prev,
                                            scope: { ...prev.scope, type: e.target.value }
                                        }))}
                                    >
                                        <option value="">Select type...</option>
                                        <option value="zone">Zone</option>
                                        <option value="partner">Partner</option>
                                        <option value="payout">Payout</option>
                                        <option value="agent">Agent</option>
                                    </select>
                                    <input
                                        type="text"
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        value={plan.scope?.id || ''}
                                        onChange={e => setPlan(prev => ({
                                            ...prev,
                                            scope: { ...prev.scope, id: e.target.value }
                                        }))}
                                        placeholder="ID (e.g., SN-DKR, partner-uuid...)"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Define Actions</h3>

                            <div className="border border-gray-200 rounded-lg p-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Add Action</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={currentAction.name}
                                    onChange={e => setCurrentAction(prev => ({ ...prev, name: e.target.value }))}
                                >
                                    <option value="">Select an action...</option>
                                    {availableActions.map(action => (
                                        <option key={action.name} value={action.name}>
                                            {action.label}
                                        </option>
                                    ))}
                                </select>

                                {currentAction.name && (
                                    <div className="space-y-2">
                                        {availableActions.find(a => a.name === currentAction.name)?.params.map(param => (
                                            <input
                                                key={param}
                                                type="text"
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder={param}
                                                onChange={e => updateActionParam(param, e.target.value)}
                                            />
                                        ))}
                                        <button
                                            className="btn-apple-primary text-sm"
                                            onClick={handleAddAction}
                                        >
                                            Add Action
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <h4 className="font-medium text-gray-700">Action Sequence</h4>
                                {plan.actions?.map((action, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div>
                                            <span className="font-medium">{action.name}</span>
                                            <pre className="text-xs text-gray-600 mt-1">
                                                {JSON.stringify(action.params, null, 2)}
                                            </pre>
                                        </div>
                                        <button
                                            className="text-red-600 hover:text-red-800 text-sm"
                                            onClick={() => setPlan(prev => ({
                                                ...prev,
                                                actions: prev.actions?.filter((_, i) => i !== index)
                                            }))}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                {(!plan.actions || plan.actions.length === 0) && (
                                    <div className="text-center py-4 text-gray-500">
                                        No actions added yet
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Review & Create</h3>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h4 className="font-medium mb-2">Plan Summary</h4>
                                <p><strong>Title:</strong> {plan.title}</p>
                                <p><strong>Description:</strong> {plan.description}</p>
                                <p><strong>Severity:</strong> {plan.severity}</p>
                                <p><strong>Scope:</strong> {plan.scope?.type} - {plan.scope?.id}</p>
                                <p><strong>Actions:</strong> {plan.actions?.length} steps</p>
                                {plan.actions?.map((action, index) => (
                                    <div key={index} className="ml-4 mt-2">
                                        <p><strong>{index + 1}.</strong> {action.name}</p>
                                        <pre className="text-xs text-gray-600">{JSON.stringify(action.params, null, 2)}</pre>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <p className="text-sm text-yellow-800">
                                    <strong>Note:</strong> This plan will require {
                                        plan.severity === 'CRITICAL' ? 3 :
                                            plan.severity === 'HIGH' ? 2 : 1
                                    } approval(s) before execution.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-between">
                    <button
                        className="btn-ghost"
                        onClick={step === 1 ? onCancel : () => setStep(step - 1)}
                    >
                        {step === 1 ? 'Cancel' : 'Back'}
                    </button>

                    <button
                        className="btn-apple-primary"
                        onClick={step < 3 ? () => setStep(step + 1) : handleSubmit}
                        disabled={step === 3 && (!plan.title || !plan.actions || plan.actions.length === 0)}
                    >
                        {step < 3 ? 'Continue' : 'Create Plan'}
                    </button>
                </div>
            </div>
        </div>
    );
}