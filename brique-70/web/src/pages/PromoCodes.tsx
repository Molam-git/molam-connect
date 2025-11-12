import { useEffect, useState } from 'react';
import { Plus, Search, Copy, CheckCircle, XCircle } from 'lucide-react';
import { fetchPromoCodes, createPromoCode, updatePromoCode, validatePromoCode } from '../utils/api';

export default function PromoCodes() {
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    loadPromoCodes();
  }, []);

  const loadPromoCodes = async () => {
    try {
      setLoading(true);
      const data = await fetchPromoCodes({ limit: 100 });
      setPromoCodes(data.data || []);
    } catch (error) {
      console.error('Failed to load promo codes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePromoCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      await createPromoCode({
        campaign_id: formData.get('campaign_id'),
        code: formData.get('code'),
        discount_type: formData.get('discount_type'),
        discount_value: parseFloat(formData.get('discount_value') as string),
        currency: formData.get('currency') || null,
        usage_limit: formData.get('usage_limit') ? parseInt(formData.get('usage_limit') as string) : null,
        per_user_limit: formData.get('per_user_limit') ? parseInt(formData.get('per_user_limit') as string) : null,
        valid_from: formData.get('valid_from') || new Date().toISOString(),
        valid_to: formData.get('valid_to') || null,
      });

      setShowCreateModal(false);
      loadPromoCodes();
    } catch (error) {
      console.error('Failed to create promo code:', error);
      alert('Failed to create promo code');
    }
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    try {
      await updatePromoCode(id, { is_active: !currentState });
      loadPromoCodes();
    } catch (error) {
      console.error('Failed to update promo code:', error);
      alert('Failed to update promo code');
    }
  };

  const handleTestCode = async () => {
    if (!testCode) return;

    try {
      const result = await validatePromoCode(testCode);
      setTestResult(result);
    } catch (error) {
      console.error('Failed to validate code:', error);
      setTestResult({ valid: false, reason: 'Error validating code' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const filteredPromoCodes = promoCodes.filter((code) =>
    code.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDiscountTypeColor = (type: string) => {
    switch (type) {
      case 'percentage': return 'bg-green-100 text-green-800';
      case 'fixed': return 'bg-blue-100 text-blue-800';
      case 'free_shipping': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading promo codes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Promo Codes</h1>
          <p className="mt-2 text-gray-600">Manage promotional codes for your campaigns</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Promo Code
        </button>
      </div>

      {/* Test Promo Code */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Test Promo Code</h2>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Enter promo code to test..."
            value={testCode}
            onChange={(e) => setTestCode(e.target.value.toUpperCase())}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={handleTestCode}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Test
          </button>
        </div>

        {testResult && (
          <div className={`mt-4 p-4 rounded-lg ${testResult.valid ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center">
              {testResult.valid ? (
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 mr-2" />
              )}
              <span className={testResult.valid ? 'text-green-800' : 'text-red-800'}>
                {testResult.valid ? 'Valid promo code!' : testResult.reason || 'Invalid promo code'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search promo codes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Promo Codes List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Discount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Valid Period
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredPromoCodes.map((promoCode) => (
              <tr key={promoCode.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <code className="font-mono font-bold text-primary-600">{promoCode.code}</code>
                    <button
                      onClick={() => copyToClipboard(promoCode.code)}
                      className="ml-2 text-gray-400 hover:text-gray-600"
                      title="Copy code"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getDiscountTypeColor(promoCode.discount_type)}`}>
                      {promoCode.discount_type}
                    </span>
                    <div className="mt-1 text-sm text-gray-900">
                      {promoCode.discount_type === 'percentage'
                        ? `${promoCode.discount_value}%`
                        : promoCode.discount_type === 'fixed'
                        ? `${promoCode.discount_value} ${promoCode.currency}`
                        : 'Free Shipping'}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {promoCode.used_count} / {promoCode.usage_limit || '∞'}
                  {promoCode.per_user_limit && (
                    <div className="text-xs text-gray-500">
                      ({promoCode.per_user_limit} per user)
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div>{new Date(promoCode.valid_from).toLocaleDateString()}</div>
                  {promoCode.valid_to && (
                    <div>to {new Date(promoCode.valid_to).toLocaleDateString()}</div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleToggleActive(promoCode.id, promoCode.is_active)}
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      promoCode.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {promoCode.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium">
                  <button className="text-primary-600 hover:text-primary-900">
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredPromoCodes.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No promo codes found</p>
          </div>
        )}
      </div>

      {/* Create Promo Code Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Promo Code</h2>
            <form onSubmit={handleCreatePromoCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign ID
                </label>
                <input
                  type="text"
                  name="campaign_id"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Promo Code
                </label>
                <input
                  type="text"
                  name="code"
                  required
                  placeholder="e.g., SUMMER2025"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono uppercase"
                  onChange={(e) => e.target.value = e.target.value.toUpperCase()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Type
                </label>
                <select
                  name="discount_type"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                  <option value="free_shipping">Free Shipping</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Discount Value
                  </label>
                  <input
                    type="number"
                    name="discount_value"
                    required
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Currency (for fixed)
                  </label>
                  <input
                    type="text"
                    name="currency"
                    placeholder="USD"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Usage Limit
                  </label>
                  <input
                    type="number"
                    name="usage_limit"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Per User Limit
                  </label>
                  <input
                    type="number"
                    name="per_user_limit"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valid From
                  </label>
                  <input
                    type="datetime-local"
                    name="valid_from"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valid To
                  </label>
                  <input
                    type="datetime-local"
                    name="valid_to"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Create Promo Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
