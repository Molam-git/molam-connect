import React from 'react';
import AgentSettlementDetail from './AgentSettlementDetail';

// Données de test - à remplacer par un appel API
const mockBatch = {
    id: 'batch_123',
    agent_id: 456,
    status: 'draft',
    total_gross: 15000.50,
    total_agent_due: 1250.75,
    reserved_buffer: 62.54
};

function App() {
    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="container mx-auto px-4">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">
                        Molam Pay - Agent Settlements
                    </h1>
                    <p className="text-gray-600">Gestion des règlements agents</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <AgentSettlementDetail batch={mockBatch} />
                    {/* Autres composants à ajouter ici */}
                </div>
            </div>
        </div>
    );
}

export default App;