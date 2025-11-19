/**
 * RBAC Hook - Role-Based Access Control
 * Vérifie si un utilisateur a accès à une fonctionnalité selon son rôle
 */

export type UserRole = 'owner' | 'ops' | 'finance' | 'marketing' | 'merchant' | 'customer' | 'agent' | 'dev';

export type Feature =
  | 'notifications'
  | 'settings'
  | 'profile'
  | 'security'
  | 'preferences'
  | 'payments'
  | 'payouts'
  | 'invoices'
  | 'alerts'
  | 'rbac'
  | 'webhooks'
  | 'logs'
  | 'campaigns'
  | 'experiments';

// Permissions matrix: role → features
const PERMISSIONS: Record<UserRole, Feature[]> = {
  owner: [
    'notifications',
    'settings',
    'profile',
    'security',
    'preferences',
    'payments',
    'payouts',
    'invoices',
    'alerts',
    'rbac',
    'webhooks',
    'logs',
    'campaigns',
    'experiments'
  ],
  ops: [
    'notifications',
    'settings',
    'security',
    'preferences',
    'payouts',
    'alerts',
    'webhooks',
    'logs',
    'experiments'
  ],
  finance: [
    'settings',
    'preferences',
    'payments',
    'payouts',
    'invoices'
  ],
  marketing: [
    'settings',
    'preferences',
    'campaigns',
    'experiments'
  ],
  merchant: [
    'settings',
    'profile',
    'preferences',
    'payments'
  ],
  agent: [
    'settings',
    'profile',
    'preferences'
  ],
  dev: [
    'settings',
    'webhooks',
    'logs'
  ],
  customer: []
};

/**
 * Check if a role has access to a specific feature
 */
export function useRBAC(role: UserRole, feature: Feature): boolean {
  const permissions = PERMISSIONS[role];

  if (!permissions) {
    console.warn(`Unknown role: ${role}`);
    return false;
  }

  return permissions.includes(feature);
}

/**
 * Get all accessible features for a role
 */
export function useAccessibleFeatures(role: UserRole): Feature[] {
  return PERMISSIONS[role] || [];
}

/**
 * Check if role has ANY of the required features
 */
export function useHasAnyFeature(role: UserRole, features: Feature[]): boolean {
  const permissions = PERMISSIONS[role] || [];
  return features.some(feature => permissions.includes(feature));
}

/**
 * Check if role has ALL of the required features
 */
export function useHasAllFeatures(role: UserRole, features: Feature[]): boolean {
  const permissions = PERMISSIONS[role] || [];
  return features.every(feature => permissions.includes(feature));
}

export default useRBAC;
