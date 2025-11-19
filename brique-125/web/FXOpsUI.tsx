// ============================================================================
// Brique 125 — FX Ops UI (React)
// ============================================================================

import React, { useState } from "react";

export default function FXOpsUI() {
  const [quote, setQuote] = useState<any>(null);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("XOF");
  const [amt, setAmt] = useState(1000);

  async function getQuote() {
    const res = await fetch("/api/fx/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_currency: from, to_currency: to, amount: amt })
    });
    setQuote(await res.json());
  }

  async function execFX() {
    const res = await fetch("/api/fx/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote_id: quote.id, amount: amt })
    });
    alert("FX exécuté : " + JSON.stringify(await res.json()));
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">FX Ops</h1>
      <div className="space-x-2">
        <input value={from} onChange={e => setFrom(e.target.value)} className="border p-1" />
        →
        <input value={to} onChange={e => setTo(e.target.value)} className="border p-1" />
        <input type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} className="border p-1" />
        <button onClick={getQuote} className="px-3 py-1 bg-gray-200">Get Quote</button>
      </div>
      {quote && (
        <div className="mt-4 border p-3 rounded">
          <div>Rate: {quote.rate}</div>
          <div>Cost: {quote.cost}</div>
          <div>Spread: {quote.spread}</div>
          <div>Provider: {quote.provider} ({quote.recommended_by})</div>
          <button onClick={execFX} className="mt-2 px-3 py-1 bg-blue-600 text-white">Execute FX</button>
        </div>
      )}
    </div>
  );
}
