import React from 'react';
import Link from 'next/link';

export default function Home() {
    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Molam Notifications</h1>
                <p className="text-gray-600">Administration des notifications transactionnelles</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link href="/ops-routing" className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                    <h2 className="text-xl font-semibold mb-2">Routing Management</h2>
                    <p className="text-gray-600">Gérer le routage des canaux par pays et événement</p>
                </Link>

                <div className="block p-6 bg-white rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-2">Outbox Monitoring</h2>
                    <p className="text-gray-600">Surveiller les notifications en attente et échouées</p>
                </div>

                <div className="block p-6 bg-white rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-2">Template Management</h2>
                    <p className="text-gray-600">Gérer les modèles de notification</p>
                </div>
            </div>
        </div>
    );
}