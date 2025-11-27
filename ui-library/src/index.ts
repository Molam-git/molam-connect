/**
 * Molam UI - Design System
 * Apple-inspired component library built with React, TypeScript, and Tailwind CSS
 *
 * @packageDocumentation
 */

// Import theme tokens
import './theme/tokens.css';

// Components
export { Button } from './components/Button/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button/Button';

export { Card } from './components/Card/Card';
export type { CardProps } from './components/Card/Card';

export { Modal } from './components/Modal/Modal';
export type { ModalProps } from './components/Modal/Modal';

export { Input } from './components/Input/Input';
export type { InputProps } from './components/Input/Input';

export { Table } from './components/Table/Table';
export type { TableProps, TableColumn } from './components/Table/Table';

export { Topbar } from './components/Topbar/Topbar';
export type { TopbarProps } from './components/Topbar/Topbar';

export { Sidebar, SidebarItem } from './components/Sidebar/Sidebar';
export type { SidebarProps, SidebarItemProps } from './components/Sidebar/Sidebar';

export { Toast } from './components/Toast/Toast';
export type { ToastProps, ToastVariant, ToastPosition } from './components/Toast/Toast';

export { Badge } from './components/Badge/Badge';
export type { BadgeProps, BadgeVariant, BadgeSize } from './components/Badge/Badge';

// Hooks
export { useTheme } from './hooks/useTheme';
export type { Theme } from './hooks/useTheme';

// Utilities
export { generateId, trapFocus, announceToScreenReader } from './utils/a11y';
