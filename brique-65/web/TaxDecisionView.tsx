import React, { useEffect, useState } from 'react';

interface TaxLine {
  rule_code: string;
  rule_id: string;
  description?: string;
  amount: number;
  currency: string;
  is_percentage: boolean;
  rate?: number;
  reverse_charge: boolean;
}

interface TaxDecision {
  id: string;
  connect_tx_id: string;
  merchant_id?: string;
  buyer_country?: string;
  jurisdiction_id: string;
  rules_applied: any;
  tax_lines: TaxLine[];
  total_tax: number;
  currency: string;
  rounding_info: any;
  computed_at: string;
}

interface TaxDecisionViewProps {
  txId: string;
}

export default function TaxDecisionView({ txId }: TaxDecisionViewProps) {
  const [decision, setDecision] = useState<TaxDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDecision();
  }, [txId]);

  const fetchDecision = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:4065/api/tax/decisions/${txId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Tax decision not found');
        }
        throw new Error('Failed to fetch tax decision');
      }

      const data = await response.json();
      setDecision(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching tax decision:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!decision) {
    return null;
  }

  return (
    <div className="p-4">
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Tax Breakdown</h2>
          <div className="text-sm text-gray-600 mt-1">Transaction: {decision.connect_tx_id}</div>
        </div>

        {/* Total Tax */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">Total Tax</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(decision.total_tax, decision.currency)}
            </div>
          </div>
        </div>

        {/* Tax Lines */}
        <div className="px-6 py-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Tax Components</h3>
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Rule Code
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Description
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Rate
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {decision.tax_lines.map((line, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{line.rule_code}</span>
                      {line.reverse_charge && (
                        <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">
                          Reverse Charge
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600">
                    {line.description || '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900">
                    {line.is_percentage && line.rate ? `${line.rate}%` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-gray-900">
                    {formatCurrency(line.amount, line.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-3 py-3 text-right font-medium text-gray-700">
                  Total Tax
                </td>
                <td className="px-3 py-3 text-right font-bold text-gray-900">
                  {formatCurrency(decision.total_tax, decision.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Metadata */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {decision.merchant_id && (
              <>
                <dt className="text-gray-600">Merchant ID</dt>
                <dd className="text-gray-900 font-mono">{decision.merchant_id}</dd>
              </>
            )}
            {decision.buyer_country && (
              <>
                <dt className="text-gray-600">Buyer Country</dt>
                <dd className="text-gray-900">{decision.buyer_country}</dd>
              </>
            )}
            <dt className="text-gray-600">Computed At</dt>
            <dd className="text-gray-900">
              {new Date(decision.computed_at).toLocaleString()}
            </dd>
            <dt className="text-gray-600">Rounding Method</dt>
            <dd className="text-gray-900">
              {decision.rounding_info?.method || 'ROUND_HALF_UP'} (
              {decision.rounding_info?.precision || 2} decimals)
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}