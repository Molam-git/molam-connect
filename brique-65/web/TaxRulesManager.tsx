import React, { useState, useEffect } from 'react';

interface TaxRule {
  id: string;
  code: string;
  description: string;
  applies_to: string[];
  is_percentage: boolean;
  rate?: number;
  fixed_amount?: number;
  effective_from: string;
  effective_to?: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
}

export default function TaxRulesManager() {
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:4065/api/tax/rules');

      if (!response.ok) {
        throw new Error('Failed to fetch tax rules');
      }

      const data = await response.json();
      setRules(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching tax rules:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Tax Rules (Ops)</h1>
        <p className="text-gray-600 mt-2">Manage tax calculation rules for all jurisdictions</p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-700">
              {rules.length} active rule{rules.length !== 1 ? 's' : ''}
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Add New Rule
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {rules.map((rule) => (
            <div key={rule.id} className="p-4 hover:bg-gray-50">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="font-medium text-gray-900">{rule.code}</div>
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {rule.jurisdiction_code}
                    </span>
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                      {rule.applies_to.join(', ')}
                    </span>
                  </div>

                  {rule.description && (
                    <div className="text-sm text-gray-600 mt-1">{rule.description}</div>
                  )}

                  <div className="text-xs text-gray-500 mt-2">
                    Effective: {rule.effective_from}
                    {rule.effective_to && ` → ${rule.effective_to}`}
                  </div>
                </div>

                <div className="text-right ml-4">
                  <div className="text-lg font-semibold text-gray-900">
                    {rule.is_percentage ? (
                      <span>{rule.rate}%</span>
                    ) : (
                      <span>${rule.fixed_amount}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {rule.is_percentage ? 'Percentage' : 'Fixed'}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded">
                  Edit
                </button>
                <button className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded">
                  History
                </button>
                <button className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded">
                  Deactivate
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {rules.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No tax rules configured. Add your first rule to get started.
        </div>
      )}
    </div>
  );
}