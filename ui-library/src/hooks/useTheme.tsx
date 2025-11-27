import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/**
 * useTheme hook - Manages light/dark theme switching
 * Persists theme preference to localStorage
 *
 * @param defaultTheme - Default theme to use ('light' or 'dark')
 * @returns Object with current theme and setter function
 *
 * @example
 * const { theme, setTheme } = useTheme('light');
 *
 * // Toggle theme
 * setTheme(theme === 'light' ? 'dark' : 'light');
 */
export function useTheme(defaultTheme: Theme = 'light') {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem('molam_theme') as Theme;
      return stored || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('molam_theme', theme);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  }, [theme]);

  return { theme, setTheme };
}
