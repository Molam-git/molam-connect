/**
 * UI Config Context Provider
 * Provides global UI configuration to all components
 */
import React, { createContext, ReactNode } from 'react';
import type { UIConfig } from '../hooks/useUIConfig';
import defaultConfig from '../config/uiConfig.json';

export const UIConfigContext = createContext<UIConfig | null>(null);

interface UIConfigProviderProps {
  children: ReactNode;
  config?: Partial<UIConfig>;
}

export function UIConfigProvider({ children, config }: UIConfigProviderProps) {
  const mergedConfig: UIConfig = {
    ...defaultConfig,
    ...config,
    theme: {
      ...defaultConfig.theme,
      ...(config?.theme || {})
    },
    notifications: {
      ...defaultConfig.notifications,
      ...(config?.notifications || {})
    },
    accessibility: {
      ...defaultConfig.accessibility,
      ...(config?.accessibility || {})
    }
  } as UIConfig;

  return (
    <UIConfigContext.Provider value={mergedConfig}>
      {children}
    </UIConfigContext.Provider>
  );
}

export default UIConfigProvider;
