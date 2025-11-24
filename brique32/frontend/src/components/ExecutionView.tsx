import React, { useState, useEffect } from 'react';
import { Plan, ActionLog } from '../types';

interface ExecutionViewProps {
    plan: Plan;
}

export function ExecutionView({ plan }: ExecutionViewProps) {
    const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
    const [isPolling, setIsPolling] = useState(false);

    useEffect(() => {
        fetchActionLogs();

        // Start polling if plan is executing
        if (['executing', 'rolling_back'].includes(plan.status)) {
            setIsPolling(true);
            const interval = setInterval(fetchActionLogs, 2000);
            return () => clearInterval(interval);
        } else {
            setIsPolling(false);
        }
    }, [plan.id, plan.status]);

    const fetchActionLogs = async () => {
        try {
            const response = await fetch(`/api/ops/${plan.id}`);
            const planData = await response.json();
            setActionLogs(planData.actions_log || []);
        } catch (error) {
            console.error('Failed to fetch action logs:', error);
        }
    };

    const handleExecute = async () => {
        try {
            await fetch(`/api/ops/${plan.id}/execute`, { method: 'POST' });
            setIsPolling(true);
        } catch (error) {
            console.error('Failed to execute plan:', error);
        }
    };

    const handleRollback = async () => {
        try {
            await fetch(`/api/ops/${plan.id}/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Manual rollback by user' })
            });
            setIsPolling(true);
        } catch (error) {
            console.error('Failed to rollback plan:', error);
        }
    };

    const handleDryRun = async () => {
        try {
            await fetch(`/api/ops/${plan.id}/dry-run`, { method: 'POST' });
            // Refresh plan data
            setTimeout(fetchActionLogs, 1000);
        } catch (error) {
            console.error('Failed to dry-run plan:', error);
        }
    };

    const getStatusColor = (status: string) => {
        const colors: { [key: string]: string } = {
            pending: 'text-gray-500 bg-gray-100',
            success: 'text-green-600 bg-green-100',
            failure: 'text-red-600 bg-red-100',
            skipped: 'text-yellow-600 bg-yellow-100'
        };
        return colors[status] || 'text-gray-500 bg-gray-100';
    };

    const getActionStatus = (index: number) => {
        return actionLogs.find(log => log.action_idx === index)?.status || 'pending';
    };

    const canExecute = plan.status === 'approved';
    const canRollback = ['executing', 'completed', 'failed'].includes(plan.status) && plan.status !== 'rolledback';
    const canDryRun = ['draft', 'pending_approval'].includes(plan.status);

    return (
        <div className="space-y-6">
            {/* Plan Header */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">{plan.title}</h1>
                        <p className="text-gray-600 mt-1">{plan.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${plan.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                                    plan.severity === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                                        plan.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-green-100 text-green-800'
                                }`}>
                                {plan.severity}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${plan.status === 'completed' ? 'bg-green-100 text-green-800' :
                                    plan.status === 'executing' ? 'bg-blue-100 text-blue-800' :
                                        plan.status === 'failed' ? 'bg-red-100 text-red-800' :
                                            plan.status === 'rolledback' ? 'bg-orange-100 text-orange-800' :
                                                'bg-gray-100 text-gray-800'
                                }`}>
                                {plan.status.replace('_', ' ').toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {canDryRun && (
                            <button onClick={handleDryRun} className="btn-apple-secondary">
                                Dry Run
                            </button>
                        )}
                        {canExecute && (
                            <button onClick={handleExecute} className="btn-apple-primary">
                                Execute Plan
                            </button>
                        )}
                        {canRollback && (
                            <button onClick={handleRollback} className="btn-ghost text-red-600 hover:bg-red-50">
                                Rollback
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Approval Panel */}
            {plan.status === 'pending_approval' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Approval Required</h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-600">
                                This plan requires {plan.required_approvals} approval(s).
                                Currently has {plan.approvals?.length || 0} approval(s).
                            </p>
                        </div>
                        <button className="btn-apple-secondary">
                            View Approval Details
                        </button>
                    </div>
                </div>
            )}

            {/* Execution Progress */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Execution Progress</h3>

                <div className="space-y-4">
                    {plan.actions.map((action, index) => {
                        const log = actionLogs.find(log => log.action_idx === index);
                        const status = getActionStatus(index);

                        return (
                            <div key={index} className="flex items-start gap-4 p-4 border border-gray-100 rounded-lg">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${status === 'success' ? 'bg-green-100 text-green-600' :
                                        status === 'failure' ? 'bg-red-100 text-red-600' :
                                            status === 'executing' ? 'bg-blue-100 text-blue-600 animate-pulse' :
                                                'bg-gray-100 text-gray-600'
                                    }`}>
                                    {index + 1}
                                </div>

                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="font-medium text-gray-900">{action.name}</span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                                            {status.toUpperCase()}
                                        </span>
                                    </div>

                                    <pre className="text-sm text-gray-600 bg-gray-50 p-2 rounded-lg mt-1">
                                        {JSON.stringify(action.params, null, 2)}
                                    </pre>

                                    {log && (
                                        <div className="mt-3 text-sm">
                                            {log.started_at && (
                                                <div className="text-gray-500">
                                                    Started: {new Date(log.started_at).toLocaleString()}
                                                </div>
                                            )}
                                            {log.finished_at && (
                                                <div className="text-gray-500">
                                                    Finished: {new Date(log.finished_at).toLocaleString()}
                                                </div>
                                            )}
                                            {log.result && (
                                                <div className="mt-2 p-2 bg-green-50 rounded-lg">
                                                    <strong>Result:</strong>
                                                    <pre className="text-xs mt-1">{JSON.stringify(log.result, null, 2)}</pre>
                                                </div>
                                            )}
                                            {log.error && (
                                                <div className="mt-2 p-2 bg-red-50 rounded-lg text-red-700">
                                                    <strong>Error:</strong> {log.error}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Polling indicator */}
                {isPolling && (
                    <div className="flex items-center gap-2 mt-4 text-sm text-blue-600">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                        Live updating...
                    </div>
                )}
            </div>

            {/* Dry Run Result */}
            {plan.dry_run_result && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Dry Run Result</h3>
                    <pre className="bg-gray-50 p-4 rounded-lg text-sm">
                        {JSON.stringify(plan.dry_run_result, null, 2)}
                    </pre>
                </div>
            )}

            {/* Execution Result */}
            {plan.execute_result && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Execution Result</h3>
                    <pre className="bg-gray-50 p-4 rounded-lg text-sm">
                        {JSON.stringify(plan.execute_result, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}