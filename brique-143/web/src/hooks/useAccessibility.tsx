/**
 * BRIQUE 143 — Accessibility Hooks & Utilities
 * WCAG 2.1 AA compliance helpers
 */

import { useEffect, useState, useCallback } from 'react';

export interface AccessibilityPreferences {
  highContrast: boolean;
  darkMode: boolean;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  reduceMotion: boolean;
  screenReader: boolean;
  keyboardNavOnly: boolean;
}

/**
 * Hook to manage accessibility preferences
 */
export function useAccessibility() {
  const [prefs, setPrefs] = useState<AccessibilityPreferences>(() => {
    // Load from localStorage
    const stored = localStorage.getItem('molam_a11y_prefs');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return getDefaultPreferences();
      }
    }
    return getDefaultPreferences();
  });

  // Sync preferences to DOM
  useEffect(() => {
    const root = document.documentElement;

    // High contrast
    if (prefs.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Dark mode
    if (prefs.darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Font size
    root.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
    root.classList.add(`font-${prefs.fontSize}`);

    // Reduce motion
    if (prefs.reduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    // Keyboard nav only
    if (prefs.keyboardNavOnly) {
      root.classList.add('keyboard-nav-only');
    } else {
      root.classList.remove('keyboard-nav-only');
    }

    // Save to localStorage
    localStorage.setItem('molam_a11y_prefs', JSON.stringify(prefs));

    // Sync with backend
    syncPreferencesToBackend(prefs).catch(console.error);
  }, [prefs]);

  // Detect system preferences
  useEffect(() => {
    // Detect dark mode preference
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleDarkModeChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('molam_a11y_prefs')) {
        setPrefs((prev) => ({ ...prev, darkMode: e.matches }));
      }
    };
    darkModeQuery.addEventListener('change', handleDarkModeChange);

    // Detect reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefs((prev) => ({ ...prev, reduceMotion: e.matches }));
    };
    motionQuery.addEventListener('change', handleMotionChange);

    return () => {
      darkModeQuery.removeEventListener('change', handleDarkModeChange);
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  const updatePreference = useCallback(
    <K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const togglePreference = useCallback((key: keyof AccessibilityPreferences) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const increaseFontSize = useCallback(() => {
    setPrefs((prev) => {
      const sizes: AccessibilityPreferences['fontSize'][] = ['small', 'medium', 'large', 'xlarge'];
      const currentIndex = sizes.indexOf(prev.fontSize);
      const nextIndex = Math.min(currentIndex + 1, sizes.length - 1);
      return { ...prev, fontSize: sizes[nextIndex] };
    });
  }, []);

  const decreaseFontSize = useCallback(() => {
    setPrefs((prev) => {
      const sizes: AccessibilityPreferences['fontSize'][] = ['small', 'medium', 'large', 'xlarge'];
      const currentIndex = sizes.indexOf(prev.fontSize);
      const nextIndex = Math.max(currentIndex - 1, 0);
      return { ...prev, fontSize: sizes[nextIndex] };
    });
  }, []);

  return {
    prefs,
    updatePreference,
    togglePreference,
    increaseFontSize,
    decreaseFontSize,
  };
}

/**
 * Hook for keyboard navigation
 */
export function useKeyboardNav(onAction: (action: string) => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          onAction('escape');
          break;
        case 'Enter':
          if (e.target instanceof HTMLElement && e.target.hasAttribute('role')) {
            e.preventDefault();
            onAction('activate');
          }
          break;
        case ' ':
          if (e.target instanceof HTMLElement && e.target.getAttribute('role') === 'button') {
            e.preventDefault();
            onAction('activate');
          }
          break;
        case 'Tab':
          // Let default tab behavior work
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onAction]);
}

/**
 * Hook for focus trap (modals, dialogs)
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // Focus first element on mount
    firstElement?.focus();

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, isActive]);
}

/**
 * Hook for announcing changes to screen readers
 */
export function useAnnouncer() {
  const [announcement, setAnnouncement] = useState('');

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    setAnnouncement('');
    setTimeout(() => {
      setAnnouncement(message);
    }, 100);
  }, []);

  return {
    announcement,
    announce,
    AnnouncerComponent: () => (
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    ),
  };
}

/**
 * Default accessibility preferences
 */
function getDefaultPreferences(): AccessibilityPreferences {
  return {
    highContrast: false,
    darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
    fontSize: 'medium',
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    screenReader: false,
    keyboardNavOnly: false,
  };
}

/**
 * Sync preferences to backend
 */
async function syncPreferencesToBackend(prefs: AccessibilityPreferences): Promise<void> {
  try {
    await fetch('/api/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        high_contrast: prefs.highContrast,
        dark_mode: prefs.darkMode,
        font_size: prefs.fontSize,
        reduce_motion: prefs.reduceMotion,
        screen_reader: prefs.screenReader,
        keyboard_nav_only: prefs.keyboardNavOnly,
      }),
    });
  } catch (error) {
    console.error('Failed to sync accessibility preferences:', error);
  }
}

/**
 * Utility: Check color contrast ratio (WCAG AA requires 4.5:1 for normal text)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getRelativeLuminance(color1);
  const lum2 = getRelativeLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(color: string): number {
  // Simplified - would need proper color parsing in production
  const rgb = color.match(/\d+/g)?.map(Number) || [0, 0, 0];
  const [r, g, b] = rgb.map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
