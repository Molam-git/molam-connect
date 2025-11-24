import React from 'react';

interface SettlementBatch {
    id: string;
    agent_id: number;
    status: string;
    total_gross: number;
    total_agent_due: number;
    reserved_buffer: number;
}

interface AgentSettlementDetailProps {
    batch: SettlementBatch;
}

const AgentSettlementDetail = ({ batch }: AgentSettlementDetailProps) => {
    const handleApprove = async () => {
        try {
            const response = await fetch(`/api/agents/settlements/${batch.id}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                alert('Batch approuvé avec succès');
                window.location.reload();
            }
        } catch (error) {
            console.error('Erreur lors de l\'approbation:', error);
        }
    };

    const handleExecute = async () => {
        try {
            const response = await fetch(`/api/agents/settlements/${batch.id}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                alert('Paiement exécuté avec succès');
                window.location.reload();
            }
        } catch (error) {
            console.error('Erreur lors de l\'exécution:', error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft': return 'bg-yellow-100 text-yellow-800';
            case 'approved': return 'bg-blue-100 text-blue-800';
            case 'processing': return 'bg-purple-100 text-purple-800';
            case 'settled': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="card">
            <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-gray-900">Batch {batch.id.slice(0, 8)}...</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(batch.status)}`}>
                    {batch.status.toUpperCase()}
                </span>
            </div>

            <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                    <span className="text-gray-600">Agent ID:</span>
                    <span className="font-medium">{batch.agent_id}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Total brut:</span>
                    <span className="font-medium">{batch.total_gross.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Commission due:</span>
                    <span className="font-medium text-green-600">{batch.total_agent_due.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Réserve:</span>
                    <span className="font-medium text-orange-600">{batch.reserved_buffer.toFixed(2)} €</span>
                </div>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={handleApprove}
                    disabled={batch.status !== 'draft'}
                    className="btn-primary disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    Approuver
                </button>
                <button
                    onClick={handleExecute}
                    disabled={batch.status !== 'approved'}
                    className="btn-primary bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    Exécuter
                </button>
            </div>
        </div>
    );
};

export default AgentSettlementDetail;