import React from 'react';

interface ConfirmStepProps {
    amount: string;
    currency?: string;
    onConfirm: () => void;
    onCancel: () => void;
    loading: boolean;
    error: string;
}

export const ConfirmStep: React.FC<ConfirmStepProps> = ({
    amount,
    currency,
    onConfirm,
    onCancel,
    loading,
    error
}) => (
    <div className="text-center space-y-6">
        <div className="w-12 h-12 mx-auto bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">✓</span>
        </div>

        <div>
            <h2 className="text-lg font-semibold">Confirmer le paiement</h2>
            <p className="text-gray-600 mt-2">
                Montant: <strong>{amount} {currency}</strong>
            </p>
        </div>

        {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
            </div>
        )}

        <div className="space-y-3">
            <button
                onClick={onConfirm}
                disabled={loading}
                className="w-full bg-black text-white py-3 rounded-lg font-semibold disabled:bg-gray-300"
            >
                {loading ? 'Confirmation...' : 'Confirmer le paiement'}
            </button>
            <button
                onClick={onCancel}
                className="w-full border border-gray-300 py-3 rounded-lg font-semibold"
            >
                Retour
            </button>
        </div>
    </div>
);