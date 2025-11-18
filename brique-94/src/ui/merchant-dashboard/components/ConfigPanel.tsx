import React, { useState, useEffect } from 'react';

interface Config {
  id: string;
  merchant_id: string;
  branding: {
    primary_color?: string;
    logo_url?: string;
  };
  checkout_settings: {
    show_molam_branding?: boolean;
    payment_methods?: string[];
    locale?: string;
  };
}

interface Props {
  merchantId: string;
}

const ConfigPanel: React.FC<Props> = ({ merchantId }) => {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [primaryColor, setPrimaryColor] = useState('#5469d4');
  const [logoUrl, setLogoUrl] = useState('');
  const [showMolamBranding, setShowMolamBranding] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['card']);
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    fetchConfig();
  }, [merchantId]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/form/config?merchant_id=${merchantId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`
        }
      });
      const data = await response.json();
      setConfig(data);

      // Populate form
      setPrimaryColor(data.branding?.primary_color || '#5469d4');
      setLogoUrl(data.branding?.logo_url || '');
      setShowMolamBranding(data.checkout_settings?.show_molam_branding !== false);
      setPaymentMethods(data.checkout_settings?.payment_methods || ['card']);
      setLocale(data.checkout_settings?.locale || 'en');
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch('/form/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          branding: {
            primary_color: primaryColor,
            logo_url: logoUrl || null
          },
          checkout_settings: {
            show_molam_branding: showMolamBranding,
            payment_methods: paymentMethods,
            locale: locale
          }
        })
      });

      if (response.ok) {
        alert('Configuration saved successfully!');
        fetchConfig();
      } else {
        const data = await response.json();
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const togglePaymentMethod = (method: string) => {
    if (paymentMethods.includes(method)) {
      setPaymentMethods(paymentMethods.filter(m => m !== method));
    } else {
      setPaymentMethods([...paymentMethods, method]);
    }
  };

  if (loading) {
    return <div className="loading">Loading configuration...</div>;
  }

  return (
    <div className="panel config-panel">
      <div className="panel-header">
        <h2>Checkout Configuration</h2>
        <button
          className="btn btn-primary"
          onClick={saveConfig}
          disabled={saving}
        >
          {saving ? 'Saving...' : '💾 Save Changes'}
        </button>
      </div>

      <div className="config-sections">
        {/* Branding Section */}
        <section className="config-section">
          <h3>🎨 Branding</h3>
          <div className="form-group">
            <label>Primary Color</label>
            <div className="color-picker">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="form-control"
                placeholder="#5469d4"
              />
            </div>
            <small className="form-text">
              This color will be used for buttons and accents in the checkout widget.
            </small>
          </div>

          <div className="form-group">
            <label>Logo URL (Optional)</label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="form-control"
              placeholder="https://example.com/logo.png"
            />
            <small className="form-text">
              Display your logo in the checkout widget. Recommended size: 200x60px.
            </small>
          </div>

          {logoUrl && (
            <div className="logo-preview">
              <label>Preview:</label>
              <img src={logoUrl} alt="Logo preview" style={{ maxHeight: '60px' }} />
            </div>
          )}
        </section>

        {/* Checkout Settings Section */}
        <section className="config-section">
          <h3>⚙️ Checkout Settings</h3>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={showMolamBranding}
                onChange={(e) => setShowMolamBranding(e.target.checked)}
              />
              Show "Powered by Molam" branding
            </label>
            <small className="form-text">
              Display Molam branding in the checkout footer.
            </small>
          </div>

          <div className="form-group">
            <label>Payment Methods</label>
            <div className="checkbox-group">
              {['card', 'bank_transfer', 'wallet'].map(method => (
                <label key={method} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={paymentMethods.includes(method)}
                    onChange={() => togglePaymentMethod(method)}
                  />
                  {method === 'card' && '💳 Card'}
                  {method === 'bank_transfer' && '🏦 Bank Transfer'}
                  {method === 'wallet' && '👛 Digital Wallet'}
                </label>
              ))}
            </div>
            <small className="form-text">
              Select which payment methods to offer to your customers.
            </small>
          </div>

          <div className="form-group">
            <label>Locale</label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="form-control"
            >
              <option value="en">English (en)</option>
              <option value="fr">Français (fr)</option>
              <option value="es">Español (es)</option>
              <option value="de">Deutsch (de)</option>
            </select>
            <small className="form-text">
              Default language for the checkout widget.
            </small>
          </div>
        </section>

        {/* Preview Section */}
        <section className="config-section">
          <h3>👁️ Preview</h3>
          <div className="checkout-preview" style={{ '--primary-color': primaryColor } as React.CSSProperties}>
            <div className="preview-widget">
              {logoUrl && <img src={logoUrl} alt="Logo" className="preview-logo" />}
              <div className="preview-amount" style={{ color: primaryColor }}>$99.99</div>
              <div className="preview-description">Premium Plan Subscription</div>
              <div className="preview-form">
                <input type="text" placeholder="Card Number" disabled />
                <div className="preview-row">
                  <input type="text" placeholder="MM/YY" disabled />
                  <input type="text" placeholder="CVC" disabled />
                </div>
                <input type="text" placeholder="Cardholder Name" disabled />
                <button
                  className="preview-button"
                  style={{ backgroundColor: primaryColor }}
                  disabled
                >
                  Pay $99.99
                </button>
              </div>
              {showMolamBranding && (
                <div className="preview-footer">Powered by Molam</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ConfigPanel;
