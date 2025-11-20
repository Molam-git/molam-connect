/**
 * Notifications Dropdown Component
 * Displays list of recent notifications
 */
import React, { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import type { Notification } from './NotificationsButton';
import { useUIConfig } from '../hooks/useUIConfig';

interface NotificationsDropdownProps {
  notifications: Notification[];
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onClose: () => void;
}

export function NotificationsDropdown({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClose
}: NotificationsDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const config = useUIConfig();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const displayedNotifications = notifications.slice(0, config.notifications.maxDisplayed);
  const hasUnread = notifications.some(n => !n.read);

  const getTypeColor = (type: Notification['type']) => {
    switch (type) {
      case 'success': return 'text-green-600 bg-green-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      case 'error': return 'text-red-600 bg-red-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="
        absolute top-12 right-0 w-96 bg-white shadow-lg rounded-2xl
        border border-gray-200 z-50 overflow-hidden
      "
      role="menu"
      aria-label="Notifications"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>

        <div className="flex items-center gap-2">
          {hasUnread && onMarkAllAsRead && (
            <button
              onClick={onMarkAllAsRead}
              className="
                text-xs text-blue-600 hover:text-blue-700
                focus:outline-none focus:underline
              "
            >
              Tout marquer comme lu
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
            aria-label="Fermer les notifications"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Notifications list */}
      <div className="max-h-96 overflow-y-auto">
        {displayedNotifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Bell className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Aucune notification</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayedNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`
                  p-4 hover:bg-gray-50 cursor-pointer transition-colors
                  ${!notification.read ? 'bg-blue-50/50' : ''}
                `}
                onClick={() => {
                  if (!notification.read && onMarkAsRead) {
                    onMarkAsRead(notification.id);
                  }
                  if (notification.link) {
                    window.location.href = notification.link;
                  }
                }}
                role="menuitem"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${getTypeColor(notification.type)}`}>
                    <div className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {notification.title}
                      </p>

                      {!notification.read && (
                        <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mt-1">
                      {notification.message}
                    </p>

                    <p className="text-xs text-gray-400 mt-1">
                      {formatTimestamp(notification.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > config.notifications.maxDisplayed && (
        <div className="border-t border-gray-200 p-3 text-center">
          <a
            href="/notifications"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Voir toutes les notifications ({notifications.length})
          </a>
        </div>
      )}
    </div>
  );
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;

  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short'
  });
}

export default NotificationsDropdown;
