/**
 * Molam Header - Barrel exports
 * Unified header component with RBAC and JSON configuration
 */

// Main components
export { Header } from './components/Header';
export { NotificationsButton } from './components/NotificationsButton';
export { NotificationsDropdown } from './components/NotificationsDropdown';
export { SettingsMenu } from './components/SettingsMenu';
export { ScrollToTopButton } from './components/ScrollToTopButton';

// Hooks
export { useRBAC, useAccessibleFeatures, useHasAnyFeature, useHasAllFeatures } from './hooks/useRBAC';
export { useUIConfig } from './hooks/useUIConfig';

// Context
export { UIConfigProvider } from './context/UIConfigContext';

// Types
export type { UserRole, Feature } from './hooks/useRBAC';
export type { Notification } from './components/NotificationsButton';
