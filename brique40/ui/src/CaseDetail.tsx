import React from "react";

interface CaseDetailProps {
    case: any;
    onUpdate: () => void;
}

export default function CaseDetail({ case: caseItem, onUpdate }: CaseDetailProps) {
    const executePlaybook = async () => {
        const idempotencyKey = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        try {
            await fetch(`/api/fraud/cases/${caseItem.id}/execute_playbook`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({ playbook_id: caseItem.playbook_id })
            });
            alert("Playbook triggered");
            onUpdate();
        } catch (error) {
            console.error("Failed to execute playbook:", error);
            alert("Failed to execute playbook");
        }
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Case Details</h2>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Case ID</label>
                    <p className="text-sm text-gray-900">{caseItem.id}</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Severity</label>
                    <p className="text-sm text-gray-900">{caseItem.severity}</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Score</label>
                    <p className="text-sm text-gray-900">{caseItem.score}</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <p className="text-sm text-gray-900">{caseItem.status}</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Suggested Action</label>
                    <p className="text-sm text-gray-900">{caseItem.suggested_action}</p>
                </div>

                <div className="pt-4">
                    <button
                        onClick={executePlaybook}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        Execute Playbook
                    </button>
                </div>
            </div>
        </div>
    );
}