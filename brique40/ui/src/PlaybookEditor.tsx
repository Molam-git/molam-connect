import React, { useState } from "react";

interface PlaybookEditorProps {
    onSave?: (playbook: any) => void;
}

export default function PlaybookEditor({ onSave }: PlaybookEditorProps) {
    const [jsonText, setJsonText] = useState(`{
  "name": "New Playbook",
  "description": "Playbook description",
  "dsl": {
    "idempotency_key": "playbook:custom-v1",
    "steps": [
      {
        "name": "create_hold",
        "type": "ledger_hold",
        "params": {
          "reference": "{{correlation_id}}",
          "amount": "{{txn_amount}}",
          "reason": "fraud_hold"
        }
      }
    ]
  }
}`);

    const handleSave = async () => {
        try {
            const playbook = JSON.parse(jsonText);
            const response = await fetch('/api/fraud/playbooks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(playbook),
            });

            if (response.ok) {
                const savedPlaybook = await response.json();
                alert('Playbook saved successfully!');
                if (onSave) {
                    onSave(savedPlaybook);
                }
            } else {
                alert('Failed to save playbook');
            }
        } catch (error: any) {
            alert(`Invalid JSON: ${error.message}`);
        }
    };

    const handleValidate = () => {
        try {
            JSON.parse(jsonText);
            alert('Playbook JSON is valid!');
        } catch (error: any) {
            alert(`Invalid JSON: ${error.message}`);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Playbook Editor</h2>

            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Playbook DSL (JSON)
                </label>
                <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    className="w-full h-96 p-3 border border-gray-300 rounded-md font-mono text-sm"
                    spellCheck="false"
                />
            </div>

            <div className="flex gap-3">
                <button
                    onClick={handleValidate}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                    Validate JSON
                </button>

                <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    Save Playbook
                </button>
            </div>

            <div className="mt-4 text-sm text-gray-600">
                <h3 className="font-medium mb-2">Available Step Types:</h3>
                <ul className="list-disc list-inside space-y-1">
                    <li><code>ledger_hold</code> - Place a hold on funds</li>
                    <li><code>ledger_release</code> - Release a hold</li>
                    <li><code>refund</code> - Process a refund</li>
                    <li><code>notify</code> - Send notifications</li>
                    <li><code>create_approval</code> - Require multi-signature approval</li>
                </ul>
            </div>
        </div>
    );
}