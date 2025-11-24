import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

export default function QRGenerator({ amount = 2500, currency = 'XOF' }) {
    const [qrData, setQrData] = useState(null);
    const [countdown, setCountdown] = useState(0);
    const [loading, setLoading] = useState(false);

    const generateQR = async () => {
        console.log('🔄 Début de generateQR');
        setLoading(true);

        try {
            console.log('📡 Envoi requête API...');
            const res = await fetch('/api/pay/qr/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer test-token` // Temporairement fixe
                },
                body: JSON.stringify({ amount, currency, expires_in: 120 })
            });

            console.log('📊 Statut réponse:', res.status);
            console.log('📊 OK?', res.ok);

            if (!res.ok) {
                const errorText = await res.text();
                console.error('❌ Erreur API:', errorText);
                throw new Error(`Erreur ${res.status}: ${errorText}`);
            }

            const data = await res.json();
            console.log('✅ Données reçues:', data);

            setQrData(data);
            setCountdown(120);

        } catch (error) {
            console.error('❌ Erreur complète:', error);
            alert('Erreur: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    console.log('🔍 Rendu QRGenerator - qrData:', qrData, 'loading:', loading);

    return (
        <div className="p-6 text-center bg-white rounded-2xl shadow-lg">
            <button
                onClick={generateQR}
                disabled={loading}
                className="bg-blue-600 text-white px-8 py-4 rounded-2xl text-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
                {loading ? 'Génération en cours...' : 'Générer QR Paiement'}
            </button>

            {qrData ? (
                <div className="mt-6 p-6 border-2 border-dashed border-gray-300 rounded-2xl">
                    <QRCode value={qrData.qr_value} size={200} />
                    <div className="mt-4 space-y-2">
                        <p className="text-xl font-semibold">{qrData.amount}</p>
                        <p className="text-gray-600">Scannez pour payer</p>
                        <p className={`text-sm ${countdown < 30 ? 'text-red-500' : 'text-orange-500'} font-medium`}>
                            ⏰ Expire dans: {countdown}s
                        </p>
                    </div>
                </div>
            ) : (
                <div className="mt-4 text-gray-500">
                    {loading ? 'Génération du QR code...' : 'Cliquez pour générer un QR code'}
                </div>
            )}
        </div>
    );
}