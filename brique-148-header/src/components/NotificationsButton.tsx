/**
 * Notifications Button Component
 * Shows notification bell with badge count
 */
import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { useRBAC, type UserRole } from '../hooks/useRBAC';
import { useUIConfig } from '../hooks/useUIConfig';
import NotificationsDropdown from './NotificationsDropdown';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
  link?: string;
}

interface NotificationsButtonProps {
  role: UserRole;
  count?: number;
  notifications?: Notification[];
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  className?: string;
}

export function NotificationsButton({
  role,
  count = 0,
  notifications = [],
  onMarkAsRead,
  onMarkAllAsRead,
  className = ''
}: NotificationsButtonProps) {
  const hasAccess = useRBAC(role, 'notifications');
  const config = useUIConfig();
  const [isOpen, setIsOpen] = useState(false);

  if (!hasAccess || !config.showNotifications) {
    return null;
  }

  const unreadCount = notifications.filter(n => !n.read).length || count;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative p-2 hover:bg-gray-100 rounded-full transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${className}
        `}
        aria-label={`Notifications (${unreadCount} non lues)`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-6 h-6 text-gray-700" />

        {unreadCount > 0 && (
          <span
            className="
              absolute top-0 right-0 bg-red-500 text-white text-xs
              rounded-full w-5 h-5 flex items-center justify-center
              font-semibold border-2 border-white
            "
            aria-label={`${unreadCount} notifications non lues`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationsDropdown
          notifications={notifications}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

export default NotificationsButton;
