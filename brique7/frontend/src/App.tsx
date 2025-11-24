import React, { useState } from 'react';
import { StaticQRPayFlow } from './components/StaticQRPayFlow';
import QRBadgeGenerator from './components/QRBadgeGenerator';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<'pay' | 'generate'>('pay');

    return (
        <div className="min-h-screen bg-gray-100 py-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
                    Molam Pay QR Statique
                </h1>

                {/* Navigation */}
                <div className="flex justify-center mb-8">
                    <div className="bg-white rounded-lg shadow-sm p-1 flex space-x-1">
                        <button
                            onClick={() => setCurrentView('pay')}
                            className={`px-6 py-3 rounded-lg font-medium transition-colors ${currentView === 'pay'
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                                }`}
                        >
                            Paiement QR
                        </button>
                        <button
                            onClick={() => setCurrentView('generate')}
                            className={`px-6 py-3 rounded-lg font-medium transition-colors ${currentView === 'generate'
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                                }`}
                        >
                            Générer Badge
                        </button>
                    </div>
                </div>

                {/* Contenu */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                    {currentView === 'pay' && <StaticQRPayFlow />}
                    {currentView === 'generate' && <QRBadgeGenerator />}
                </div>
            </div>
        </div>
    );
};

export default App;