/**
 * Header Component - Apple-like unified header
 * RBAC strict: Each element visible only if user has rights
 * Minimal, clean, fluid interactions
 */
import React, { useState } from 'react';
import { Settings, Menu } from 'lucide-react';
import type { UserRole } from '../hooks/useRBAC';
import { useRBAC } from '../hooks/useRBAC';
import { useUIConfig } from '../hooks/useUIConfig';
import { NotificationsButton } from './NotificationsButton';
import type { Notification } from './NotificationsButton';
import { SettingsMenu } from './SettingsMenu';

interface HeaderProps {
  role: UserRole;
  userName?: string;
  userEmail?: string;
  notifications?: Notification[];
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onNavigate?: (path: string) => void;
  onMobileMenuToggle?: () => void;
  className?: string;
}

export function Header({
  role,
  userName,
  userEmail,
  notifications = [],
  onMarkAsRead,
  onMarkAllAsRead,
  onNavigate,
  onMobileMenuToggle,
  className = ''
}: HeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const config = useUIConfig();
  const hasSettingsAccess = useRBAC(role, 'settings');

  const handleSettingsClick = () => {
    setIsSettingsOpen(!isSettingsOpen);
  };

  const handleNavigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.href = path;
    }
  };

  return (
    <header
      className={`
        fixed top-0 left-0 right-0 z-50
        bg-white border-b border-gray-200
        transition-all duration-300 ease-in-out
        ${className}
      `}
      style={{
        height: `${config.theme.headerHeight}px`,
        backdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(255, 255, 255, 0.95)'
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Left: Logo + Mobile menu */}
          <div className="flex items-center gap-4">
            {/* Mobile menu button */}
            {onMobileMenuToggle && (
              <button
                onClick={onMobileMenuToggle}
                className="
                  lg:hidden p-2 rounded-lg
                  hover:bg-gray-100 transition-colors
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                "
                aria-label="Ouvrir le menu"
              >
                <Menu className="w-6 h-6 text-gray-700" />
              </button>
            )}

            {/* Logo */}
            <a
              href="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              aria-label="Molam Pay - Accueil"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: config.theme.primaryColor }}
              >
                M
              </div>
              <span className="hidden sm:block text-lg font-semibold text-gray-900">
                Molam Pay
              </span>
            </a>
          </div>

          {/* Center: Navigation (optional, can be added later) */}
          <nav className="hidden lg:flex items-center gap-6">
            {/* Navigation items can be added here based on role */}
          </nav>

          {/* Right: User actions */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            {config.features.showNotifications && (
              <NotificationsButton
                role={role}
                notifications={notifications}
                onMarkAsRead={onMarkAsRead}
                onMarkAllAsRead={onMarkAllAsRead}
              />
            )}

            {/* Settings */}
            {config.features.showSettings && hasSettingsAccess && (
              <div className="relative">
                <button
                  onClick={handleSettingsClick}
                  className={`
                    p-2 rounded-lg transition-all
                    hover:bg-gray-100
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${isSettingsOpen ? 'bg-gray-100' : ''}
                  `}
                  aria-label="Paramètres"
                  aria-expanded={isSettingsOpen}
                >
                  <Settings className="w-6 h-6 text-gray-700" />
                </button>

                {isSettingsOpen && (
                  <SettingsMenu
                    role={role}
                    onClose={() => setIsSettingsOpen(false)}
                    onNavigate={handleNavigate}
                  />
                )}
              </div>
            )}

            {/* User menu */}
            {userName && (
              <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-gray-200">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-gray-900">
                    {userName}
                  </span>
                  {userEmail && (
                    <span className="text-xs text-gray-500">
                      {userEmail}
                    </span>
                  )}
                </div>

                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-700">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
