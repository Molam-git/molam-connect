import React from 'react';

interface SuccessStepProps {
    onContinue: () => void;
}

export const SuccessStep: React.FC<SuccessStepProps> = ({ onContinue }) => (
    <div className="text-center space-y-6">
        <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
        </div>

        <div>
            <h2 className="text-xl font-semibold text-gray-900">Paiement réussi!</h2>
            <p className="text-gray-600 mt-2">
                Votre paiement a été traité avec succès.
            </p>
        </div>

        <button
            onClick={onContinue}
            className="w-full bg-black text-white py-3 rounded-lg font-semibold"
        >
            Effectuer un nouveau paiement
        </button>
    </div>
);