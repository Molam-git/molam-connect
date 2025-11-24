// src/components/StaticQRBadge.tsx
import React from "react";
import QRCode from "react-qr-code";

interface StaticQRBadgeProps {
    qrValue: string;
    displayName: string;
}

const StaticQRBadge: React.FC<StaticQRBadgeProps> = ({ qrValue, displayName }) => {
    return (
        <div className="w-72 p-4 rounded-2xl shadow-lg bg-white text-center">
            <div className="text-xl font-semibold mb-2">{displayName}</div>
            <div className="bg-gray-50 p-3 rounded-xl">
                <QRCode value={qrValue} size={180} />
            </div>
            <div className="mt-3 text-sm opacity-70">Scan to pay with Molam</div>
        </div>
    );
};

// ⚠️ ASSUREZ-VOUS D'AVOIR CETTE LIGNE :
export default StaticQRBadge; // ← Export par défaut