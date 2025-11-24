// src/components/QRBadgeGenerator.tsx
import React, { useState } from "react";
import StaticQRBadge from "./StaticQRBadge";

const QRBadgeGenerator: React.FC = () => {
  const [qrValue, setQrValue] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");

  const generateBadge = () => {
    // Générer un QR value exemple
    setQrValue("molam:stq:v=1|t=M|mid=merchant123|tid=terminal456|cc=SN|cur=XOF|sig=examplesignature");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Générateur de Badge QR</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Nom du Commerce/Agent</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Entrez le nom à afficher"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Valeur du QR</label>
            <textarea
              value={qrValue}
              onChange={(e) => setQrValue(e.target.value)}
              className="w-full p-2 border rounded h-24"
              placeholder="La valeur encodée du QR"
            />
          </div>
          
          <button
            onClick={generateBadge}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Générer un Badge de Test
          </button>
        </div>
        
        <div className="flex justify-center">
          {qrValue && displayName && (
            <StaticQRBadge qrValue={qrValue} displayName={displayName} />
          )}
        </div>
      </div>
    </div>
  );
};

export default QRBadgeGenerator;