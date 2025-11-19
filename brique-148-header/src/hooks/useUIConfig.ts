/**
 * UI Configuration Hook
 * Access global UI configuration from JSON
 */
import { useContext } from 'react';
import { UIConfigContext } from '../context/UIConfigContext';
import defaultConfig from '../config/uiConfig.json';

export interface UIConfig {
  showNotifications: boolean;
  showSettings: boolean;
  showUserMenu: boolean;
  languages: string[];
  defaultLanguage: string;
  currencies: string[];
  defaultCurrency: string;
  theme: {
    primaryColor: string;
    headerHeight: string;
    backgroundColor: string;
    textColor: string;
    borderRadius: string;
  };
  notifications: {
    enabled: boolean;
    realtime: boolean;
    maxDisplayed: number;
    autoRefreshInterval: number;
  };
  accessibility: {
    keyboardNavigation: boolean;
    focusVisible: boolean;
    highContrast: boolean;
  };
}

export function useUIConfig(): UIConfig {
  const context = useContext(UIConfigContext);

  if (!context) {
    // Return default config if no provider
    return defaultConfig as UIConfig;
  }

  return context;
}

export default useUIConfig;
