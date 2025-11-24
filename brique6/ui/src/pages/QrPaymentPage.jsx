// ui/pages/QrPaymentPage.jsx
import React from 'react';
import QRGenerator from '../components/QRGenerator';

export default function QrPaymentPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-md mx-auto">
                <h1 className="text-3xl font-bold text-center mb-2">Paiement QR</h1>
                <p className="text-gray-600 text-center mb-8">Générez un QR code pour recevoir un paiement</p>
                <QRGenerator amount={2500} currency="XOF" />
            </div>
        </div>
    );
}