/**
 * Brique 75 - Merchant Settings UI
 *
 * Apple-like merchant configuration interface with:
 * - Tab-based navigation
 * - General settings (language, currency, timezone)
 * - Branding with live preview
 * - Payment methods management
 * - Commission override workflow
 * - Settings history and rollback
 * - Audit trail viewer
 *
 * @module MerchantSettings
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

interface MerchantSettings {
  id: string;
  merchant_id: string;
  default_currency: string;
  default_language: string;
  supported_currencies: string[];
  supported_languages: string[];
  timezone: string;
  active_payment_methods: string[];
  payment_method_priority: string[];
  version: number;
  updated_at: string;
}

interface MerchantBranding {
  id: string;
  merchant_id: string;
  business_name: string;
  logo_url?: string;
  logo_square_url?: string;
  favicon_url?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  button_style: 'square' | 'rounded' | 'pill';
  checkout_theme: 'light' | 'dark' | 'auto';
  checkout_layout: 'embedded' | 'redirect' | 'popup';
  support_email?: string;
  website_url?: string;
}

interface PaymentMethodConfig {
  id: string;
  method_type: string;
  provider?: string;
  is_enabled: boolean;
  display_name?: string;
  display_order: number;
  min_amount?: number;
  max_amount?: number;
  daily_limit?: number;
  fee_type?: 'percentage' | 'fixed' | 'hybrid';
  fee_percentage?: number;
  fee_fixed?: number;
}

interface CommissionOverride {
  id: string;
  commission_rate: number;
  reason: string;
  justification?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requested_by: string;
  approved_by?: string;
  created_at: string;
}

interface SettingsHistory {
  id: string;
  version: number;
  settings_snapshot: any;
  changed_fields: string[];
  changed_by: string;
  created_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string;
  changes: any;
  created_at: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ============================================================================
// PAYMENT METHOD METADATA
// ============================================================================

const PAYMENT_METHOD_METADATA: Record<string, { icon: string; label: string; color: string }> = {
  wallet: { icon: '💳', label: 'Molam Wallet', color: '#0066CC' },
  card: { icon: '💳', label: 'Credit/Debit Card', color: '#FF6B35' },
  mobile_money: { icon: '📱', label: 'Mobile Money', color: '#34C759' },
  bank_transfer: { icon: '🏦', label: 'Bank Transfer', color: '#5856D6' },
  ussd: { icon: '#️⃣', label: 'USSD', color: '#FF9500' },
  qr_code: { icon: '📲', label: 'QR Code', color: '#AF52DE' },
};

const MOBILE_MONEY_PROVIDERS: Record<string, { icon: string; label: string }> = {
  mtn_momo: { icon: '🟡', label: 'MTN Mobile Money' },
  orange_money: { icon: '🟠', label: 'Orange Money' },
  wave: { icon: '🔵', label: 'Wave' },
  moov: { icon: '🔴', label: 'Moov Money' },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const MerchantSettings: React.FC<{ merchantId: string }> = ({ merchantId }) => {
  const [activeTab, setActiveTab] = useState<string>('general');
  const [loading, setLoading] = useState<boolean>(true);
  const [settings, setSettings] = useState<MerchantSettings | null>(null);
  const [branding, setBranding] = useState<MerchantBranding | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [activeCommissionRate, setActiveCommissionRate] = useState<number>(2.5);

  // Load all settings on mount
  useEffect(() => {
    loadSettings();
  }, [merchantId]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/connect/${merchantId}/settings`);
      const data = response.data.settings;

      setSettings(data.settings);
      setBranding(data.branding);
      setPaymentMethods(data.payment_methods);
      setActiveCommissionRate(data.active_commission_rate);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-3xl font-semibold text-gray-900">Merchant Settings</h1>
          <p className="mt-2 text-gray-600">Configure your payment processing and branding</p>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex space-x-8 border-b border-gray-200">
            <TabButton
              active={activeTab === 'general'}
              onClick={() => setActiveTab('general')}
              icon="⚙️"
              label="General"
            />
            <TabButton
              active={activeTab === 'branding'}
              onClick={() => setActiveTab('branding')}
              icon="🎨"
              label="Branding"
            />
            <TabButton
              active={activeTab === 'payment-methods'}
              onClick={() => setActiveTab('payment-methods')}
              icon="💳"
              label="Payment Methods"
            />
            <TabButton
              active={activeTab === 'commission'}
              onClick={() => setActiveTab('commission')}
              icon="💰"
              label="Commission"
            />
            <TabButton
              active={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              icon="📜"
              label="History"
            />
            <TabButton
              active={activeTab === 'audit'}
              onClick={() => setActiveTab('audit')}
              icon="🔍"
              label="Audit"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'general' && <GeneralSettings merchantId={merchantId} settings={settings!} onUpdate={loadSettings} />}
        {activeTab === 'branding' && <BrandingSettings merchantId={merchantId} branding={branding} onUpdate={loadSettings} />}
        {activeTab === 'payment-methods' && (
          <PaymentMethodsSettings merchantId={merchantId} paymentMethods={paymentMethods} onUpdate={loadSettings} />
        )}
        {activeTab === 'commission' && (
          <CommissionSettings merchantId={merchantId} currentRate={activeCommissionRate} onUpdate={loadSettings} />
        )}
        {activeTab === 'history' && <SettingsHistoryView merchantId={merchantId} currentVersion={settings?.version || 1} />}
        {activeTab === 'audit' && <AuditTrailView merchantId={merchantId} />}
      </div>
    </div>
  );
};

// ============================================================================
// TAB BUTTON COMPONENT
// ============================================================================

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string }> = ({
  active,
  onClick,
  icon,
  label,
}) => (
  <button
    onClick={onClick}
    className={`
      flex items-center space-x-2 px-4 py-3 border-b-2 font-medium transition-colors
      ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'}
    `}
  >
    <span className="text-xl">{icon}</span>
    <span>{label}</span>
  </button>
);

// ============================================================================
// GENERAL SETTINGS
// ============================================================================

const GeneralSettings: React.FC<{
  merchantId: string;
  settings: MerchantSettings;
  onUpdate: () => void;
}> = ({ merchantId, settings, onUpdate }) => {
  const [formData, setFormData] = useState({
    default_currency: settings.default_currency,
    default_language: settings.default_language,
    supported_currencies: settings.supported_currencies,
    timezone: settings.timezone,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/connect/${merchantId}/settings`, formData);
      onUpdate();
      alert('Settings updated successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">General Settings</h2>

      <div className="space-y-6">
        {/* Default Currency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Default Currency</label>
          <select
            value={formData.default_currency}
            onChange={(e) => setFormData({ ...formData, default_currency: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="XOF">XOF - West African CFA Franc</option>
            <option value="EUR">EUR - Euro</option>
            <option value="USD">USD - US Dollar</option>
            <option value="GBP">GBP - British Pound</option>
          </select>
        </div>

        {/* Default Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Default Language</label>
          <select
            value={formData.default_language}
            onChange={(e) => setFormData({ ...formData, default_language: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
          <select
            value={formData.timezone}
            onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="Africa/Dakar">Africa/Dakar (GMT+0)</option>
            <option value="Africa/Abidjan">Africa/Abidjan (GMT+0)</option>
            <option value="Africa/Lagos">Africa/Lagos (GMT+1)</option>
            <option value="Europe/Paris">Europe/Paris (GMT+1)</option>
          </select>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// BRANDING SETTINGS
// ============================================================================

const BrandingSettings: React.FC<{
  merchantId: string;
  branding: MerchantBranding | null;
  onUpdate: () => void;
}> = ({ merchantId, branding, onUpdate }) => {
  const [formData, setFormData] = useState({
    business_name: branding?.business_name || '',
    logo_url: branding?.logo_url || '',
    primary_color: branding?.primary_color || '#0066CC',
    secondary_color: branding?.secondary_color || '#333333',
    accent_color: branding?.accent_color || '#FF6B35',
    background_color: branding?.background_color || '#FFFFFF',
    text_color: branding?.text_color || '#000000',
    font_family: branding?.font_family || 'Inter',
    button_style: branding?.button_style || 'rounded',
    checkout_theme: branding?.checkout_theme || 'light',
    support_email: branding?.support_email || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/connect/${merchantId}/branding`, formData);
      onUpdate();
      alert('Branding updated successfully!');
    } catch (error) {
      console.error('Failed to save branding:', error);
      alert('Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-8">
      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm p-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Branding Configuration</h2>

        <div className="space-y-6">
          {/* Business Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
            <input
              type="text"
              value={formData.business_name}
              onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="My Business"
            />
          </div>

          {/* Logo URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Logo URL</label>
            <input
              type="url"
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://example.com/logo.png"
            />
          </div>

          {/* Primary Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
            <div className="flex space-x-3">
              <input
                type="color"
                value={formData.primary_color}
                onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                className="h-12 w-16 border border-gray-300 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={formData.primary_color}
                onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="#0066CC"
              />
            </div>
          </div>

          {/* Secondary Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
            <div className="flex space-x-3">
              <input
                type="color"
                value={formData.secondary_color}
                onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                className="h-12 w-16 border border-gray-300 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={formData.secondary_color}
                onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="#333333"
              />
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Accent Color</label>
            <div className="flex space-x-3">
              <input
                type="color"
                value={formData.accent_color}
                onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                className="h-12 w-16 border border-gray-300 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={formData.accent_color}
                onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="#FF6B35"
              />
            </div>
          </div>

          {/* Button Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Button Style</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setFormData({ ...formData, button_style: 'square' })}
                className={`px-4 py-3 border-2 rounded font-medium transition-all ${
                  formData.button_style === 'square'
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                Square
              </button>
              <button
                onClick={() => setFormData({ ...formData, button_style: 'rounded' })}
                className={`px-4 py-3 border-2 rounded-lg font-medium transition-all ${
                  formData.button_style === 'rounded'
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                Rounded
              </button>
              <button
                onClick={() => setFormData({ ...formData, button_style: 'pill' })}
                className={`px-4 py-3 border-2 rounded-full font-medium transition-all ${
                  formData.button_style === 'pill'
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                Pill
              </button>
            </div>
          </div>

          {/* Checkout Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Checkout Theme</label>
            <select
              value={formData.checkout_theme}
              onChange={(e) =>
                setFormData({ ...formData, checkout_theme: e.target.value as 'light' | 'dark' | 'auto' })
              }
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="light">☀️ Light</option>
              <option value="dark">🌙 Dark</option>
              <option value="auto">🔄 Auto (follows system)</option>
            </select>
          </div>

          {/* Support Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Support Email</label>
            <input
              type="email"
              value={formData.support_email}
              onChange={(e) => setFormData({ ...formData, support_email: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="support@example.com"
            />
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div className="bg-white rounded-xl shadow-sm p-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Live Preview</h2>

        <div
          className="border-2 border-gray-200 rounded-xl p-8"
          style={{ backgroundColor: formData.background_color, color: formData.text_color }}
        >
          {/* Logo */}
          {formData.logo_url && (
            <div className="mb-6">
              <img src={formData.logo_url} alt="Logo" className="h-12" />
            </div>
          )}

          {/* Business Name */}
          <h3 className="text-2xl font-bold mb-4" style={{ fontFamily: formData.font_family }}>
            {formData.business_name || 'Your Business Name'}
          </h3>

          {/* Sample checkout interface */}
          <div className="space-y-4">
            <p className="text-sm opacity-75">Sample Checkout Preview</p>

            {/* Primary Button */}
            <button
              className={`w-full py-3 px-6 font-medium text-white transition-opacity hover:opacity-90 ${
                formData.button_style === 'pill' ? 'rounded-full' : formData.button_style === 'rounded' ? 'rounded-lg' : 'rounded'
              }`}
              style={{ backgroundColor: formData.primary_color }}
            >
              Pay with Primary
            </button>

            {/* Secondary Button */}
            <button
              className={`w-full py-3 px-6 font-medium text-white transition-opacity hover:opacity-90 ${
                formData.button_style === 'pill' ? 'rounded-full' : formData.button_style === 'rounded' ? 'rounded-lg' : 'rounded'
              }`}
              style={{ backgroundColor: formData.secondary_color }}
            >
              Secondary Action
            </button>

            {/* Accent Button */}
            <button
              className={`w-full py-3 px-6 font-medium text-white transition-opacity hover:opacity-90 ${
                formData.button_style === 'pill' ? 'rounded-full' : formData.button_style === 'rounded' ? 'rounded-lg' : 'rounded'
              }`}
              style={{ backgroundColor: formData.accent_color }}
            >
              Accent Action
            </button>
          </div>

          {/* Color Palette */}
          <div className="mt-8">
            <p className="text-sm opacity-75 mb-3">Color Palette</p>
            <div className="grid grid-cols-5 gap-2">
              <div
                className="h-12 rounded"
                style={{ backgroundColor: formData.primary_color }}
                title={`Primary: ${formData.primary_color}`}
              ></div>
              <div
                className="h-12 rounded"
                style={{ backgroundColor: formData.secondary_color }}
                title={`Secondary: ${formData.secondary_color}`}
              ></div>
              <div
                className="h-12 rounded"
                style={{ backgroundColor: formData.accent_color }}
                title={`Accent: ${formData.accent_color}`}
              ></div>
              <div
                className="h-12 rounded border border-gray-300"
                style={{ backgroundColor: formData.background_color }}
                title={`Background: ${formData.background_color}`}
              ></div>
              <div
                className="h-12 rounded border border-gray-300"
                style={{ backgroundColor: formData.text_color }}
                title={`Text: ${formData.text_color}`}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// PAYMENT METHODS SETTINGS
// ============================================================================

const PaymentMethodsSettings: React.FC<{
  merchantId: string;
  paymentMethods: PaymentMethodConfig[];
  onUpdate: () => void;
}> = ({ merchantId, paymentMethods, onUpdate }) => {
  const handleToggle = async (method: PaymentMethodConfig) => {
    try {
      await apiClient.post(`/connect/${merchantId}/payment-methods/${method.method_type}/toggle`, {
        provider: method.provider,
        enabled: !method.is_enabled,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to toggle payment method:', error);
      alert('Failed to toggle payment method');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Payment Methods</h2>

      <div className="space-y-4">
        {paymentMethods.map((method) => {
          const metadata = PAYMENT_METHOD_METADATA[method.method_type];
          const providerMeta = method.provider ? MOBILE_MONEY_PROVIDERS[method.provider] : null;

          return (
            <div
              key={method.id}
              className="flex items-center justify-between p-6 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <span className="text-3xl">{metadata?.icon || '💳'}</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    {providerMeta ? providerMeta.label : method.display_name || metadata?.label || method.method_type}
                  </h3>
                  <div className="flex items-center space-x-3 mt-1">
                    {method.fee_percentage && (
                      <span className="text-sm text-gray-600">Fee: {method.fee_percentage}%</span>
                    )}
                    {method.min_amount && <span className="text-sm text-gray-600">Min: {method.min_amount} XOF</span>}
                    {method.max_amount && <span className="text-sm text-gray-600">Max: {method.max_amount} XOF</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    method.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {method.is_enabled ? '✓ Enabled' : 'Disabled'}
                </span>

                <button
                  onClick={() => handleToggle(method)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    method.is_enabled
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {method.is_enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// COMMISSION SETTINGS
// ============================================================================

const CommissionSettings: React.FC<{
  merchantId: string;
  currentRate: number;
  onUpdate: () => void;
}> = ({ merchantId, currentRate, onUpdate }) => {
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [history, setHistory] = useState<CommissionOverride[]>([]);
  const [formData, setFormData] = useState({
    commission_rate: currentRate,
    reason: '',
    justification: '',
  });

  useEffect(() => {
    loadHistory();
  }, [merchantId]);

  const loadHistory = async () => {
    try {
      const response = await apiClient.get(`/connect/${merchantId}/commission/history`);
      setHistory(response.data.overrides);
    } catch (error) {
      console.error('Failed to load commission history:', error);
    }
  };

  const handleRequest = async () => {
    try {
      await apiClient.post(`/connect/${merchantId}/commission/request-override`, formData);
      alert('Commission override request submitted for approval');
      setShowRequestForm(false);
      setFormData({ commission_rate: currentRate, reason: '', justification: '' });
      loadHistory();
      onUpdate();
    } catch (error) {
      console.error('Failed to request commission override:', error);
      alert('Failed to submit request');
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Rate */}
      <div className="bg-white rounded-xl shadow-sm p-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Current Commission Rate</h2>
        <div className="flex items-center space-x-4">
          <div className="text-5xl font-bold text-blue-600">{currentRate}%</div>
          <button
            onClick={() => setShowRequestForm(!showRequestForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Request Override
          </button>
        </div>
      </div>

      {/* Request Form */}
      {showRequestForm && (
        <div className="bg-white rounded-xl shadow-sm p-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Request Commission Override</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">New Commission Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.commission_rate}
                onChange={(e) => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reason (10-500 chars)</label>
              <input
                type="text"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., High volume merchant discount"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Justification (min 20 chars)</label>
              <textarea
                value={formData.justification}
                onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Provide detailed justification for this override request..."
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowRequestForm(false)}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRequest}
                disabled={
                  formData.reason.length < 10 ||
                  formData.justification.length < 20 ||
                  formData.commission_rate === currentRate
                }
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-xl shadow-sm p-8">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Override History</h3>

        <div className="space-y-3">
          {history.map((override) => (
            <div key={override.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">{override.commission_rate}% - {override.reason}</div>
                <div className="text-sm text-gray-600 mt-1">
                  Requested {new Date(override.created_at).toLocaleDateString()}
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  override.status === 'approved'
                    ? 'bg-green-100 text-green-700'
                    : override.status === 'rejected'
                    ? 'bg-red-100 text-red-700'
                    : override.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {override.status.charAt(0).toUpperCase() + override.status.slice(1)}
              </span>
            </div>
          ))}

          {history.length === 0 && <p className="text-gray-500 text-center py-8">No override requests yet</p>}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SETTINGS HISTORY VIEW
// ============================================================================

const SettingsHistoryView: React.FC<{
  merchantId: string;
  currentVersion: number;
}> = ({ merchantId, currentVersion }) => {
  const [history, setHistory] = useState<SettingsHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [merchantId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/connect/${merchantId}/settings/history`);
      setHistory(response.data.history);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (version: number) => {
    if (!confirm(`Are you sure you want to rollback to version ${version}?`)) return;

    try {
      await apiClient.post(`/connect/${merchantId}/settings/rollback`, { target_version: version });
      alert(`Successfully rolled back to version ${version}`);
      window.location.reload();
    } catch (error) {
      console.error('Failed to rollback:', error);
      alert('Failed to rollback settings');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Settings Version History</h2>

      <div className="space-y-3">
        {history.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <div className="flex items-center space-x-3">
                <span className="font-semibold text-gray-900">Version {entry.version}</span>
                {entry.version === currentVersion && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">CURRENT</span>
                )}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {new Date(entry.created_at).toLocaleString()} • Changed: {entry.changed_fields.join(', ')}
              </div>
            </div>

            {entry.version !== currentVersion && (
              <button
                onClick={() => handleRollback(entry.version)}
                className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg font-medium transition-colors"
              >
                Rollback
              </button>
            )}
          </div>
        ))}

        {history.length === 0 && !loading && <p className="text-gray-500 text-center py-8">No version history yet</p>}
      </div>
    </div>
  );
};

// ============================================================================
// AUDIT TRAIL VIEW
// ============================================================================

const AuditTrailView: React.FC<{ merchantId: string }> = ({ merchantId }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuditLog();
    verifyIntegrity();
  }, [merchantId]);

  const loadAuditLog = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/connect/${merchantId}/audit`);
      setEntries(response.data.audit_entries);
    } catch (error) {
      console.error('Failed to load audit log:', error);
    } finally {
      setLoading(false);
    }
  };

  const verifyIntegrity = async () => {
    try {
      const response = await apiClient.get(`/connect/${merchantId}/audit/verify`);
      setVerification(response.data.verification);
    } catch (error) {
      console.error('Failed to verify integrity:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Integrity Status */}
      {verification && (
        <div
          className={`rounded-xl p-6 ${
            verification.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}
        >
          <div className="flex items-center space-x-3">
            <span className="text-3xl">{verification.valid ? '✅' : '❌'}</span>
            <div>
              <h3 className="text-lg font-semibold">
                {verification.valid ? 'Audit Trail Verified' : 'Integrity Check Failed'}
              </h3>
              <p className="text-sm mt-1">
                {verification.valid
                  ? `All ${verification.total_entries} entries verified with valid hash chain`
                  : verification.error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Audit Entries */}
      <div className="bg-white rounded-xl shadow-sm p-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Audit Log</h2>

        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-900">{entry.action.replace(/_/g, ' ')}</span>
                  <div className="text-sm text-gray-600 mt-1">{new Date(entry.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}

          {entries.length === 0 && !loading && <p className="text-gray-500 text-center py-8">No audit entries yet</p>}
        </div>
      </div>
    </div>
  );
};

export default MerchantSettings;
