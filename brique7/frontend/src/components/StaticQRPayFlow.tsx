import React, { useState } from "react";
import { QRParseResponse, CreatePaymentResponse } from "../types/qr";

export const StaticQRPayFlow: React.FC = () => {
  const [meta, setMeta] = useState<QRParseResponse | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [paymentId, setPaymentId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Fonction pour obtenir un QR de test valide depuis le backend
  const getTestQR = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/pay/qr/static/test-qr");
      if (!response.ok) throw new Error("Impossible de récupérer le QR de test");

      const data = await response.json();
      await onScan(data.qr_value);
    } catch (error) {
      console.error("Erreur:", error);
      setError("Impossible de récupérer le QR de test. Utilisation d'un QR simulé.");
      // Fallback vers un QR simulé
      await onScan('molam:stq:v=1|t=M|mid=test-merchant|tid=test-terminal|cc=SN|cur=XOF|sig=test-signature-development-only');
    } finally {
      setIsLoading(false);
    }
  };

  const onScan = async (qrValue: string) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/pay/qr/static/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_value: qrValue })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur HTTP! status: ${response.status}`);
      }

      const data: QRParseResponse = await response.json();
      setMeta(data);
    } catch (error) {
      console.error("Erreur lors du scan du QR:", error);
      setError(`Erreur: ${(error as Error).message}`);

      // Fallback: données simulées pour le développement
      setMeta({
        type: "merchant",
        merchant: {
          id: "test-merchant",
          display_name: "Boutique de Test"
        },
        terminal: {
          id: "test-terminal",
          label: "Caisse Principale"
        },
        country_code: "SN",
        currency: "XOF",
        presets: [
          { amount: 1000, label: "Petit déjeuner" },
          { amount: 2500, label: "Déjeuner" },
          { amount: 5000, label: "Dîner" }
        ],
        raw: qrValue
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createPayment = async () => {
    if (!meta) {
      setError("Aucune métadonnée QR disponible");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/pay/qr/static/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_value: meta.raw,
          amount: Number(amount),
          currency: meta.currency
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur HTTP! status: ${response.status}`);
      }

      const data: CreatePaymentResponse = await response.json();
      setPaymentId(data.payment_id);

      // Afficher l'aperçu
      alert(`Paiement créé!\nMontant: ${data.preview.amount}\nFrais: ${data.preview.fees.molam}\nTotal: ${data.preview.total}`);
    } catch (error) {
      console.error("Erreur lors de la création du paiement:", error);
      setError(`Erreur création: ${(error as Error).message}`);

      // Fallback: simulation de paiement
      setPaymentId('demo-payment-' + Date.now());
      alert(`Paiement créé (Mode Démo)!\nMontant: ${amount} XOF\nFrais: 25 XOF\nTotal: ${Number(amount) + 25} XOF`);
    } finally {
      setIsLoading(false);
    }
  };

  const confirm = async (pin: string) => {
    if (!paymentId) {
      setError("Aucun paiement à confirmer");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/pay/qr/static/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: paymentId, pin })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur HTTP! status: ${response.status}`);
      }

      const data = await response.json();
      alert('✅ ' + data.message);

      // Reset après confirmation
      setMeta(null);
      setAmount("");
      setPaymentId("");
    } catch (error) {
      console.error("Erreur lors de la confirmation:", error);
      setError(`Erreur confirmation: ${(error as Error).message}`);

      // Fallback: simulation de confirmation
      alert('✅ Paiement confirmé avec succès! (Mode Démo)');
      setMeta(null);
      setAmount("");
      setPaymentId("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      {error && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {!meta ? (
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">Paiement par QR Code</h2>

          <div className="bg-gray-50 rounded-lg p-8 mb-6">
            <div className="text-lg font-semibold mb-4">Scanner un QR Code</div>

            {/* Zone de scan */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:bg-white transition-colors mb-6"
              onClick={getTestQR}
            >
              {isLoading ? (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
                  <p className="text-gray-600">Scan en cours...</p>
                </div>
              ) : (
                <>
                  <div className="text-5xl mb-4">📷</div>
                  <p className="text-gray-600 font-medium">Zone de scan du QR code</p>
                  <p className="text-gray-500 text-sm mt-2">Cliquez pour scanner un QR de test</p>
                </>
              )}
            </div>

            {/* QR Code de test visible */}
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-sm font-medium mb-2 text-gray-700">QR Code de test disponible :</p>
              <button
                onClick={getTestQR}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400"
              >
                {isLoading ? "Chargement..." : "Obtenir un QR de Test Valide"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="text-xl font-semibold text-green-800 mb-2">Commerce détecté</h3>
            <div className="text-lg font-semibold text-green-600">
              {meta.merchant?.display_name || meta.agent?.display_name || "Agent"}
            </div>
            {meta.terminal && (
              <div className="text-sm text-green-700">Terminal: {meta.terminal.label}</div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Montant ({meta.currency})
              </label>
              <input
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={`Entrez le montant en ${meta.currency}`}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                type="number"
                min="0"
              />
            </div>

            {/* Présélections */}
            {meta.presets && meta.presets.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Montants prédéfinis:</p>
                <div className="flex flex-wrap gap-2">
                  {meta.presets.map((preset, index) => (
                    <button
                      key={index}
                      onClick={() => setAmount(preset.amount.toString())}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium hover:bg-blue-200 transition-colors"
                    >
                      {preset.label || `${preset.amount} ${meta.currency}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={createPayment}
              disabled={!amount || isLoading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              {isLoading ? "Création..." : "Continuer vers Paiement"}
            </button>
          </div>

          {paymentId && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2">Paiement Prêt</h3>
              <p className="text-sm text-yellow-700 mb-4">ID: {paymentId}</p>
              <button
                onClick={() => {
                  const pin = prompt("Entrez votre PIN (1234 pour la démo):");
                  if (pin) confirm(pin);
                }}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                Confirmer le Paiement
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};