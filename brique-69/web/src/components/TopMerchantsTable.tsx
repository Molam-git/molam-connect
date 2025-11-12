import React from 'react';
import { TrendingUp } from 'lucide-react';

interface TopMerchantsTableProps {
  merchants: any[];
  loading?: boolean;
}

export default function TopMerchantsTable({ merchants, loading }: TopMerchantsTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (merchants.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>No merchant data available</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500 border-b">
            <th className="pb-3 font-medium">Merchant</th>
            <th className="pb-3 font-medium text-right">Volume</th>
            <th className="pb-3 font-medium text-right">Net</th>
            <th className="pb-3 font-medium text-right">Txns</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {merchants.map((merchant, idx) => (
            <tr key={merchant.merchant_id} className="hover:bg-gray-50 transition-colors">
              <td className="py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm">
                    {idx + 1}
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {merchant.merchant_id.slice(0, 8)}...
                  </span>
                </div>
              </td>
              <td className="py-3 text-right text-sm font-medium text-gray-900">
                ${parseFloat(merchant.gross || 0).toLocaleString()}
              </td>
              <td className="py-3 text-right text-sm text-gray-600">
                ${parseFloat(merchant.net || 0).toLocaleString()}
              </td>
              <td className="py-3 text-right text-sm text-gray-600">
                {parseInt(merchant.tx_count || 0).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
