// ============================================================================
// FX Simulator UI - Real-Time Provider Comparison
// ============================================================================

import React, { useState } from "react";

interface FXQuote {
  pair: string;
  rate: number;
  spread: number;
  providers: Array<{ provider_id: string; rate: number; weight: number }>;
  computed_at: string;
}

interface ConversionResult {
  pair: string;
  base: string;
  quote: string;
  amount_from: number;
  amount_to: number;
  rate: number;
  spread: number;
  spread_cost: number;
  computed_at: string;
}

export default function FXSimulator() {
  const [pair, setPair] = useState("USD/XOF");
  const [amount, setAmount] = useState(1000);
  const [quote, setQuote] = useState<FXQuote | null>(null);
  const [conversion, setConversion] = useState<ConversionResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchQuote() {
    setLoading(true);
    try {
      const [base, quoteCurrency] = pair.split("/");
      const res = await fetch(`/api/fx-agg/quote?base=${base}&quote=${quoteCurrency}`);
      const data = await res.json();
      setQuote(data);
      setConversion(null);
    } catch (e: any) {
      console.error("Quote error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function simulateConversion() {
    setLoading(true);
    try {
      const [base, quoteCurrency] = pair.split("/");
      const res = await fetch("/api/fx-agg/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base, quote: quoteCurrency, amount })
      });
      const data = await res.json();
      setConversion(data);
    } catch (e: any) {
      console.error("Conversion error:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">FX Simulator - Real-Time Aggregator</h1>

      {/* Input Controls */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Currency Pair</label>
            <input
              type="text"
              value={pair}
              onChange={(e) => setPair(e.target.value.toUpperCase())}
              placeholder="USD/XOF"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <button
            onClick={fetchQuote}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            Get Quote
          </button>
          <button
            onClick={simulateConversion}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
          >
            Simulate
          </button>
        </div>
      </div>

      {/* Quote Display */}
      {quote && (
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-3">Live Quote - {quote.pair}</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-600">Rate</div>
              <div className="text-xl font-bold">{quote.rate.toFixed(6)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Spread</div>
              <div className="text-xl font-bold">{(quote.spread * 100).toFixed(4)}%</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Computed At</div>
              <div className="text-sm">{new Date(quote.computed_at).toLocaleTimeString()}</div>
            </div>
          </div>

          {/* Provider Breakdown */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Provider Breakdown (SIRA-weighted)</h3>
            <div className="space-y-2">
              {quote.providers.map((p, i) => (
                <div key={i} className="flex justify-between items-center border-l-4 border-blue-500 pl-3 py-2 bg-gray-50">
                  <span className="font-mono text-sm">{p.provider_id}</span>
                  <div className="flex gap-4">
                    <span className="text-sm">Rate: {p.rate.toFixed(6)}</span>
                    <span className="text-sm font-semibold">Weight: {(p.weight * 100).toFixed(2)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Conversion Result */}
      {conversion && (
        <div className="bg-green-50 p-4 rounded-lg shadow border border-green-200">
          <h2 className="text-lg font-semibold mb-3">Conversion Result</h2>
          <div className="text-3xl font-bold mb-2">
            {conversion.amount_from.toLocaleString()} {conversion.base} → {conversion.amount_to.toLocaleString()} {conversion.quote}
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm mt-4">
            <div>
              <span className="text-gray-600">Rate:</span> <span className="font-semibold">{conversion.rate.toFixed(6)}</span>
            </div>
            <div>
              <span className="text-gray-600">Spread:</span> <span className="font-semibold">{(conversion.spread * 100).toFixed(4)}%</span>
            </div>
            <div>
              <span className="text-gray-600">Spread Cost:</span> <span className="font-semibold">{conversion.spread_cost.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
