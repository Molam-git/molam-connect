import React, { useState } from 'react';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Input } from '../components/Input/Input';

/**
 * ThemeEditor - Runtime CSS variable editor for design system
 * This is an OPS tool for developers to test theme customization
 *
 * @example
 * import { ThemeEditor } from '@molam/ui/ops';
 *
 * // In development only
 * {process.env.NODE_ENV === 'development' && <ThemeEditor />}
 */
export const ThemeEditor: React.FC = () => {
  const [variables, setVariables] = useState({
    '--molam-primary': '#0A84FF',
    '--molam-on-primary': '#ffffff',
    '--molam-bg': '#ffffff',
    '--molam-surface': '#f9fafb',
    '--molam-text': '#0b1220',
    '--molam-text-secondary': '#64748b',
    '--molam-border': '#e2e8f0',
    '--molam-success': '#34c759',
    '--molam-warning': '#ff9f0a',
    '--molam-error': '#ff3b30',
    '--molam-info': '#5ac8fa',
    '--molam-radius': '12px',
  });

  const updateVariable = (name: string, value: string) => {
    setVariables(prev => ({ ...prev, [name]: value }));
    document.documentElement.style.setProperty(name, value);
  };

  const resetVariables = () => {
    Object.entries(variables).forEach(([name, value]) => {
      document.documentElement.style.removeProperty(name);
    });

    // Reset to defaults
    const defaults = {
      '--molam-primary': '#0A84FF',
      '--molam-on-primary': '#ffffff',
      '--molam-bg': '#ffffff',
      '--molam-surface': '#f9fafb',
      '--molam-text': '#0b1220',
      '--molam-text-secondary': '#64748b',
      '--molam-border': '#e2e8f0',
      '--molam-success': '#34c759',
      '--molam-warning': '#ff9f0a',
      '--molam-error': '#ff3b30',
      '--molam-info': '#5ac8fa',
      '--molam-radius': '12px',
    };
    setVariables(defaults);
    Object.entries(defaults).forEach(([name, value]) => {
      document.documentElement.style.setProperty(name, value);
    });
  };

  const exportCSS = () => {
    const css = Object.entries(variables)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join('\n');

    const fullCSS = `:root {\n${css}\n}`;
    navigator.clipboard.writeText(fullCSS);
    alert('CSS copied to clipboard!');
  };

  return (
    <Card
      title="🎨 Theme Editor"
      subtitle="Edit CSS variables in real-time"
      padding="lg"
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        maxWidth: '400px',
        maxHeight: '80vh',
        overflow: 'auto',
        zIndex: 9999,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {Object.entries(variables).map(([name, value]) => (
            <div key={name}>
              <Input
                label={name.replace('--molam-', '')}
                value={value}
                onChange={(e) => updateVariable(name, e.target.value)}
                inputSize="sm"
                startIcon={
                  name.includes('color') || name.startsWith('--molam-') && !name.includes('radius') ? (
                    <input
                      type="color"
                      value={value.startsWith('#') ? value : '#0A84FF'}
                      onChange={(e) => updateVariable(name, e.target.value)}
                      style={{ width: '20px', height: '20px', border: 'none', cursor: 'pointer' }}
                    />
                  ) : undefined
                }
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <Button size="sm" variant="ghost" onClick={resetVariables} fullWidth>
            Reset
          </Button>
          <Button size="sm" onClick={exportCSS} fullWidth>
            Export CSS
          </Button>
        </div>

        <div
          style={{
            padding: '0.75rem',
            background: 'var(--molam-surface)',
            borderRadius: '8px',
            fontSize: '0.75rem',
            color: 'var(--molam-text-secondary)',
          }}
        >
          💡 Changes are applied in real-time. Use "Export CSS" to copy the generated CSS to your clipboard.
        </div>
      </div>
    </Card>
  );
};

ThemeEditor.displayName = 'ThemeEditor';
