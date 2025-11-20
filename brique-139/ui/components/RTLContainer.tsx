/**
 * BRIQUE 139 — RTL Container Component
 * Automatic RTL/LTR layout management
 */

import React, { useEffect } from 'react';

export interface RTLContainerProps {
  children: React.ReactNode;
  direction?: 'ltr' | 'rtl' | 'auto';
  lang?: string;
  className?: string;
}

/**
 * RTL Container Component
 * Automatically handles RTL/LTR layout based on language
 */
export function RTLContainer({
  children,
  direction = 'auto',
  lang,
  className = '',
}: RTLContainerProps) {
  useEffect(() => {
    // Set document direction
    if (direction !== 'auto') {
      document.documentElement.dir = direction;
    }

    // Set document language
    if (lang) {
      document.documentElement.lang = lang;
    }
  }, [direction, lang]);

  return (
    <div dir={direction} lang={lang} className={className}>
      {children}
    </div>
  );
}

/**
 * Hook to detect RTL based on language
 */
export function useRTL(lang: string): boolean {
  const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
  return rtlLanguages.includes(lang);
}

/**
 * RTL-aware flex direction helper
 */
export function getRTLFlexDirection(
  direction: 'row' | 'row-reverse' | 'column' | 'column-reverse',
  isRTL: boolean
): string {
  if (!isRTL) return direction;

  const mapping: Record<string, string> = {
    row: 'row-reverse',
    'row-reverse': 'row',
    column: 'column',
    'column-reverse': 'column-reverse',
  };

  return mapping[direction] || direction;
}

/**
 * RTL-aware positioning helper
 */
export function getRTLPosition(
  position: 'left' | 'right' | 'top' | 'bottom',
  isRTL: boolean
): string {
  if (!isRTL) return position;

  const mapping: Record<string, string> = {
    left: 'right',
    right: 'left',
    top: 'top',
    bottom: 'bottom',
  };

  return mapping[position] || position;
}

/**
 * RTL-aware class names
 */
export function getRTLClassName(baseClass: string, isRTL: boolean): string {
  if (!isRTL) return baseClass;

  // Replace directional utilities with RTL equivalents
  const rtlMap: Record<string, string> = {
    'text-left': 'text-right',
    'text-right': 'text-left',
    'ml-': 'mr-',
    'mr-': 'ml-',
    'pl-': 'pr-',
    'pr-': 'pl-',
    'left-': 'right-',
    'right-': 'left-',
    'rounded-l': 'rounded-r',
    'rounded-r': 'rounded-l',
  };

  let rtlClass = baseClass;
  Object.entries(rtlMap).forEach(([ltr, rtl]) => {
    if (rtlClass.includes(ltr)) {
      rtlClass = rtlClass.replace(new RegExp(ltr, 'g'), rtl);
    }
  });

  return rtlClass;
}
