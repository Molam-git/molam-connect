import React, { useState } from 'react';
import { Approval, MolamUser } from '../types';

interface ApprovalPanelProps {
    planId: string;
    approvals: Approval[];
    requiredApprovals: number;
    currentUser: MolamUser;
    onApprove: (decision: string, note: string) => void;
}

export function ApprovalPanel({ planId, approvals, requiredApprovals, currentUser, onApprove }: ApprovalPanelProps) {
    const [decision, setDecision] = useState<'accept' | 'reject'>('accept');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const hasApproved = approvals.some(approval =>
        approval.user_id === currentUser.id && approval.decision === 'accept'
    );

    const canApprove = currentUser.roles.some((role: string) =>
        ['ops_manager', 'cto', 'cfo', 'pay_zone_admin'].includes(role)
    ) && !hasApproved;

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await onApprove(decision, note);
            setNote('');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getApprovalProgress = () => {
        const accepted = approvals.filter(a => a.decision === 'accept').length;
        return (accepted / requiredApprovals) * 100;
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Approval Process</h3>

            {/* Progress bar */}
            <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Approval Progress</span>
                    <span>{approvals.filter(a => a.decision === 'accept').length}/{requiredApprovals}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${getApprovalProgress()}%` }}
                    />
                </div>
            </div>

            {/* Approval form */}
            {canApprove && (
                <div className="border border-gray-200 rounded-lg p-4 mb-6">
                    <h4 className="font-medium text-gray-900 mb-3">Your Approval</h4>
                    <div className="space-y-3">
                        <div className="flex gap-4">
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    name="decision"
                                    value="accept"
                                    checked={decision === 'accept'}
                                    onChange={() => setDecision('accept')}
                                    className="mr-2"
                                />
                                <span className="text-green-600 font-medium">Approve</span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    name="decision"
                                    value="reject"
                                    checked={decision === 'reject'}
                                    onChange={() => setDecision('reject')}
                                    className="mr-2"
                                />
                                <span className="text-red-600 font-medium">Reject</span>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Notes {decision === 'reject' && <span className="text-red-600">*</span>}
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder={decision === 'reject' ? 'Please provide a reason for rejection...' : 'Optional notes...'}
                                required={decision === 'reject'}
                            />
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || (decision === 'reject' && !note.trim())}
                            className="btn-apple-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Approval'}
                        </button>
                    </div>
                </div>
            )}

            {/* Approvals list */}
            <div>
                <h4 className="font-medium text-gray-900 mb-3">Approval History</h4>
                <div className="space-y-3">
                    {approvals.map((approval, index) => (
                        <div key={index} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-gray-900">User {approval.user_id}</span>
                                    <span className="text-sm text-gray-500">({approval.role})</span>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${approval.decision === 'accept'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}>
                                        {approval.decision}
                                    </span>
                                </div>
                                {approval.note && (
                                    <p className="text-sm text-gray-600 mt-1">{approval.note}</p>
                                )}
                                <div className="text-xs text-gray-500 mt-1">
                                    {new Date(approval.ts).toLocaleString()} •
                                    Signature: {approval.signature.substring(0, 16)}...
                                </div>
                            </div>
                        </div>
                    ))}

                    {approvals.length === 0 && (
                        <div className="text-center py-4 text-gray-500">
                            No approvals yet
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}