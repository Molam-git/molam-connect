import React, { useState, useEffect } from 'react';
import { Plan } from '../types';

interface OrdersJournalProps {
    onPlanSelect: (plan: Plan) => void;
}

export function OrdersJournal({ onPlanSelect }: OrdersJournalProps) {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: '',
        severity: '',
        search: ''
    });

    useEffect(() => {
        fetchPlans();
    }, [filters]);

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            if (filters.status) queryParams.append('status', filters.status);
            if (filters.severity) queryParams.append('severity', filters.severity);

            const response = await fetch(`/api/ops?${queryParams}`);
            const data = await response.json();
            setPlans(data);
        } catch (error) {
            console.error('Failed to fetch plans:', error);
        } finally {
            setLoading(false);
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

    const filteredPlans = plans.filter(plan =>
        plan.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        plan.description.toLowerCase().includes(filters.search.toLowerCase())
    );

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-medium text-gray-900">Orders Journal</h2>
                <p className="text-gray-600 mt-1">Immutable audit trail of all operational plans</p>
            </div>

            {/* Filters */}
            <div className="p-6 border-b border-gray-100">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search plans..."
                            value={filters.search}
                            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="">All Status</option>
                        <option value="draft">Draft</option>
                        <option value="pending_approval">Pending Approval</option>
                        <option value="approved">Approved</option>
                        <option value="executing">Executing</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                        <option value="rolledback">Rolled Back</option>
                    </select>
                    <select
                        value={filters.severity}
                        onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value }))}
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="">All Severity</option>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                    </select>
                </div>
            </div>

            {/* Plans List */}
            <div className="p-6">
                {loading ? (
                    <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-gray-600 mt-2">Loading plans...</p>
                    </div>
                ) : filteredPlans.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        No plans found matching your criteria
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredPlans.map(plan => (
                            <div
                                key={plan.id}
                                className="p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-colors cursor-pointer"
                                onClick={() => onPlanSelect(plan)}
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
                                    <button className="btn-ghost text-sm">View Details</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination would go here */}
        </div>
    );
}