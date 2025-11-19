/**
 * BRIQUE 143 — React i18n Provider
 * Frontend internationalization context and hooks
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import en from '../../locales/en.json';
import fr from '../../locales/fr.json';
import wo from '../../locales/wo.json';
import ar from '../../locales/ar.json';

// Supported languages
const translations: Record<string, any> = { en, fr, wo, ar };
export type Lang = 'en' | 'fr' | 'wo' | 'ar';

interface I18nContextType {
  lang: Lang;
  t: (key: string, fallback?: string) => string;
  setLang: (l: Lang) => void;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType | null>(null);

interface I18nProviderProps {
  children: ReactNode;
  initialLang?: Lang;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children, initialLang = 'en' }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    // Try to get from localStorage first
    const stored = localStorage.getItem('molam_lang');
    if (stored && (stored === 'en' || stored === 'fr' || stored === 'wo' || stored === 'ar')) {
      return stored as Lang;
    }
    return initialLang;
  });

  const isRTL = lang === 'ar';

  // Persist language preference
  useEffect(() => {
    localStorage.setItem('molam_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  }, [lang, isRTL]);

  // Translation function with nested key support
  const t = (key: string, fallback?: string): string => {
    const keys = key.split('.');
    let value: any = translations[lang];

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        value = undefined;
        break;
      }
    }

    // If not found in current lang, try English
    if (value === undefined) {
      value = translations['en'];
      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = value[k];
        } else {
          value = undefined;
          break;
        }
      }
    }

    return value || fallback || key;
  };

  const setLang = (l: Lang) => {
    setLangState(l);
    // Optionally sync with backend
    syncLanguagePreference(l).catch(console.error);
  };

  return (
    <I18nContext.Provider value={{ lang, t, setLang, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
};

/**
 * Hook to access i18n context
 */
export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return ctx;
}

/**
 * Sync language preference with backend
 */
async function syncLanguagePreference(lang: Lang): Promise<void> {
  try {
    await fetch('/api/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ language: lang }),
    });
  } catch (error) {
    console.error('Failed to sync language preference:', error);
  }
}

/**
 * Language selector component
 */
export function LanguageSelector() {
  const { lang, setLang, t } = useI18n();

  const languages = [
    { code: 'en' as Lang, name: 'English', native: 'English' },
    { code: 'fr' as Lang, name: 'French', native: 'Français' },
    { code: 'wo' as Lang, name: 'Wolof', native: 'Wolof' },
    { code: 'ar' as Lang, name: 'Arabic', native: 'العربية' },
  ];

  return (
    <div className="language-selector">
      <label htmlFor="lang-select" className="sr-only">
        {t('settings.language', 'Language')}
      </label>
      <select
        id="lang-select"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="px-3 py-2 border rounded"
        aria-label={t('settings.language', 'Language')}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * HOC to inject translation function
 */
export function withI18n<P extends object>(
  Component: React.ComponentType<P & { t: (key: string, fallback?: string) => string }>
) {
  return (props: P) => {
    const { t } = useI18n();
    return <Component {...props} t={t} />;
  };
}
