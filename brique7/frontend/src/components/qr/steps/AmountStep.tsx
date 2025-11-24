import React from 'react';

interface PaymentMeta {
    type: 'merchant' | 'agent';
    merchant?: { id: string; display_name: string };
    terminal?: { id: string; label: string };
    country_code: string;
    currency: string;
    presets: Array<{ amount: number; label: string }>;
}

interface AmountStepProps {
    meta: PaymentMeta;
    amount: string;
    selectedPreset: number | null;
    onPresetSelect: (amount: number) => void;
    onCustomAmountChange: (value: string) => void;
    onCreatePayment: () => void;
    loading: boolean;
    error: string;
}

export const AmountStep: React.FC<AmountStepProps> = ({
    meta,
    amount,
    selectedPreset,
    onPresetSelect,
    onCustomAmountChange,
    onCreatePayment,
    loading,
    error
}) => (
    <div className="space-y-6">
        <div className="text-center">
            <h2 className="text-lg font-semibold">
                {meta.merchant?.display_name || 'Agent'}
            </h2>
            {meta.terminal && (
                <p className="text-gray-500 text-sm">{meta.terminal.label}</p>
            )}
        </div>

        {/* Présélections */}
        {meta.presets.length > 0 && (
            <div>
                <h3 className="font-medium mb-3">Montants suggérés</h3>
                <div className="grid grid-cols-2 gap-3">
                    {meta.presets.map((preset, index) => (
                        <button
                            key={index}
                            onClick={() => onPresetSelect(preset.amount)}
                            className={`p-3 border rounded-lg text-center ${selectedPreset === preset.amount
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-300 hover:border-gray-400'
                                }`}
                        >
                            <div className="font-semibold">{preset.amount} {meta.currency}</div>
                            {preset.label && (
                                <div className="text-xs text-gray-500 mt-1">{preset.label}</div>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        )}

        {/* Montant personnalisé */}
        <div>
            <h3 className="font-medium mb-3">Montant personnalisé</h3>
            <div className="relative">
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => onCustomAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full p-3 border border-gray-300 rounded-lg text-right text-lg font-semibold pr-12"
                />
                <div className="absolute right-3 top-3 text-gray-500 font-medium">
                    {meta.currency}
                </div>
            </div>
        </div>

        {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
            </div>
        )}

        <button
            onClick={onCreatePayment}
            disabled={!amount || loading}
            className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
            {loading ? 'Création...' : 'Continuer'}
        </button>
    </div>
);