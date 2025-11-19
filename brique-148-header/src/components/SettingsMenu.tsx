/**
 * Settings Menu Component
 * Displays settings menu with items from JSON config
 * Filtered by user role (RBAC)
 */
import React, { useEffect, useRef } from 'react';
import { Settings, X } from 'lucide-react';
import * as Icons from 'lucide-react';
import type { UserRole } from '../hooks/useRBAC';
import { useRBAC } from '../hooks/useRBAC';
import { useUIConfig } from '../hooks/useUIConfig';
import settingsMenuConfig from '../config/settingsMenu.json';

interface SettingsMenuProps {
  role: UserRole;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

interface MenuItem {
  id: string;
  label: string;
  labelEn: string;
  icon: string;
  roles: UserRole[];
  path: string;
  description?: string;
  descriptionEn?: string;
}

type MenuConfig = Record<string, MenuItem[]>;

export function SettingsMenu({ role, onClose, onNavigate }: SettingsMenuProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const config = useUIConfig();
  const hasSettingsAccess = useRBAC(role, 'settings');

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

  if (!hasSettingsAccess) {
    return null;
  }

  const menuConfig = settingsMenuConfig as MenuConfig;

  // Filter menu items by user role
  const getAccessibleItems = (items: MenuItem[]): MenuItem[] => {
    return items.filter(item => {
      const feature = item.id as any;
      return useRBAC(role, feature);
    });
  };

  // Get icon component from lucide-react
  const getIcon = (iconName: string) => {
    const IconComponent = (Icons as any)[iconName];
    return IconComponent ? <IconComponent className="w-5 h-5" /> : null;
  };

  // Handle item click
  const handleItemClick = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.href = path;
    }
    onClose();
  };

  // Get category label
  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      general: 'Général',
      finance: 'Finance',
      ops: 'Ops & Sécurité',
      marketing: 'Marketing'
    };
    return labels[category] || category;
  };

  return (
    <div
      ref={dropdownRef}
      className="
        absolute top-12 right-0 w-96 bg-white shadow-lg rounded-2xl
        border border-gray-200 z-50 overflow-hidden
      "
      role="menu"
      aria-label="Menu des paramètres"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-700" />
          <h3 className="text-sm font-semibold text-gray-900">Paramètres</h3>
        </div>

        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Fermer les paramètres"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Menu content */}
      <div className="max-h-96 overflow-y-auto">
        {Object.entries(menuConfig).map(([category, items]) => {
          const accessibleItems = getAccessibleItems(items);

          if (accessibleItems.length === 0) {
            return null;
          }

          return (
            <div key={category} className="py-2">
              {/* Category header */}
              <div className="px-4 py-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {getCategoryLabel(category)}
                </h4>
              </div>

              {/* Category items */}
              <div>
                {accessibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.path)}
                    className="
                      w-full px-4 py-3 flex items-start gap-3
                      hover:bg-gray-50 transition-colors
                      text-left
                    "
                    role="menuitem"
                  >
                    <div className="flex-shrink-0 text-gray-600 mt-0.5">
                      {getIcon(item.icon)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.label}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-3 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          Configuré par Molam Ops via settingsMenu.json
        </p>
      </div>
    </div>
  );
}

export default SettingsMenu;
