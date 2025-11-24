import React from 'react';

interface ScanStepProps {
    onScan: (qrValue: string) => void;
    loading: boolean;
    error: string;
}

export const ScanStep: React.FC<ScanStepProps> = ({ onScan, loading, error }) => (
    <div className="text-center space-y-4">
        <h2 className="text-lg font-semibold">Scanner le QR Code</h2>
        <div className="bg-gray-100 rounded-lg p-8">
            {loading ? (
                <div className="text-gray-500">Scan en cours...</div>
            ) : (
                <div className="text-gray-400">Zone de scan du QR code</div>
            )}
        </div>

        {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
            </div>
        )}

        <button
            onClick={() => onScan('molam:stq:v=1|t=M|mid=demo|tid=001|cc=SN|cur=XOF|sig=abc123')}
            className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600"
        >
            Scanner un QR de démo
        </button>
    </div>
);