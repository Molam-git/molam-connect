/**
 * BRIQUE 139 — Language Switcher Component
 * Accessible language selector with proper ARIA attributes
 */

import React, { useState } from 'react';

export interface Language {
  code: string;
  name: string;
  native_name: string;
  direction: 'ltr' | 'rtl';
}

export interface LanguageSwitcherProps {
  currentLanguage: string;
  languages: Language[];
  onChange: (languageCode: string) => void;
  className?: string;
  variant?: 'dropdown' | 'buttons' | 'compact';
}

/**
 * Language Switcher Component
 * Supports multiple display variants with full accessibility
 */
export function LanguageSwitcher({
  currentLanguage,
  languages,
  onChange,
  className = '',
  variant = 'buttons',
}: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);

  const currentLang = languages.find((l) => l.code === currentLanguage);

  // Button variant - horizontal button group
  if (variant === 'buttons') {
    return (
      <div
        className={`inline-flex gap-2 ${className}`}
        role="group"
        aria-label="Language selection"
      >
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => onChange(lang.code)}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors
              ${
                lang.code === currentLanguage
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
            aria-label={`Switch to ${lang.name}`}
            aria-pressed={lang.code === currentLanguage}
            type="button"
          >
            <span className="uppercase">{lang.code}</span>
          </button>
        ))}
      </div>
    );
  }

  // Dropdown variant - select element
  if (variant === 'dropdown') {
    return (
      <div className={`relative ${className}`}>
        <label htmlFor="language-select" className="sr-only">
          Select Language
        </label>
        <select
          id="language-select"
          value={currentLanguage}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full px-4 py-2 pr-8 text-sm border border-gray-300 rounded-md
            bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            appearance-none cursor-pointer"
          aria-label="Language selection"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.native_name} ({lang.code.toUpperCase()})
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
    );
  }

  // Compact variant - popover menu
  if (variant === 'compact') {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700
            bg-white dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600
            rounded-md hover:bg-gray-50 dark:hover:bg-gray-700
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-label="Language menu"
          type="button"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
            />
          </svg>
          <span className="uppercase">{currentLang?.code || currentLanguage}</span>
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            {/* Menu */}
            <div
              className="absolute right-0 z-20 mt-2 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg
                border border-gray-200 dark:border-gray-700 py-1"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="language-menu"
            >
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    onChange(lang.code);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors
                    ${
                      lang.code === currentLanguage
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                    focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700`}
                  role="menuitem"
                  type="button"
                >
                  <div className="flex items-center justify-between">
                    <span>{lang.native_name}</span>
                    <span className="text-xs text-gray-500 uppercase">{lang.code}</span>
                  </div>
                  {lang.direction === 'rtl' && (
                    <span className="text-xs text-gray-500">RTL</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
}

/**
 * Hook to manage language state
 */
export function useLanguage(defaultLang: string = 'fr') {
  const [currentLanguage, setCurrentLanguage] = useState(defaultLang);

  const changeLanguage = (langCode: string) => {
    setCurrentLanguage(langCode);

    // Update document direction for RTL languages
    const lang = languages.find((l) => l.code === langCode);
    if (lang) {
      document.documentElement.lang = langCode;
      document.documentElement.dir = lang.direction;
    }

    // Persist to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('molam_language', langCode);
    }
  };

  return {
    currentLanguage,
    changeLanguage,
  };
}

// Default languages (should be fetched from API in production)
const languages: Language[] = [
  { code: 'fr', name: 'French', native_name: 'Français', direction: 'ltr' },
  { code: 'en', name: 'English', native_name: 'English', direction: 'ltr' },
  { code: 'wo', name: 'Wolof', native_name: 'Wolof', direction: 'ltr' },
  { code: 'ar', name: 'Arabic', native_name: 'العربية', direction: 'rtl' },
];
