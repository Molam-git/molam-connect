/**
 * Network status detection utilities for offline fallback
 */

import type { NetworkStatus } from '../types';

/**
 * Detect current network status
 */
export async function detectNetworkStatus(): Promise<NetworkStatus> {
  // Check basic online status
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isOnline) {
    return {
      isOnline: false,
      quality: 'offline',
    };
  }

  // Measure network quality via latency check
  try {
    const latency = await measureLatency();

    let quality: NetworkStatus['quality'];

    if (latency < 100) {
      quality = 'excellent';
    } else if (latency < 300) {
      quality = 'good';
    } else if (latency < 1000) {
      quality = 'poor';
    } else {
      quality = 'offline';
    }

    return {
      isOnline: latency < 5000,
      quality,
      latency,
    };
  } catch (error) {
    return {
      isOnline: false,
      quality: 'offline',
    };
  }
}

/**
 * Measure network latency by pinging a lightweight endpoint
 */
async function measureLatency(): Promise<number> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('/api/ping', {
      method: 'HEAD',
      cache: 'no-cache',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return Date.now() - startTime;
    }

    throw new Error('Ping failed');
  } catch (error) {
    return 5000; // Timeout or error
  }
}

/**
 * Monitor network status changes
 */
export function monitorNetworkStatus(
  onStatusChange: (status: NetworkStatus) => void
): () => void {
  let currentStatus: NetworkStatus | null = null;
  let checkInterval: NodeJS.Timeout;

  const checkStatus = async () => {
    const newStatus = await detectNetworkStatus();

    // Only notify on status change
    if (
      !currentStatus ||
      currentStatus.isOnline !== newStatus.isOnline ||
      currentStatus.quality !== newStatus.quality
    ) {
      currentStatus = newStatus;
      onStatusChange(newStatus);
    }
  };

  // Initial check
  checkStatus();

  // Listen to browser online/offline events
  const handleOnline = () => checkStatus();
  const handleOffline = () => checkStatus();

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  // Periodic check every 10 seconds
  checkInterval = setInterval(checkStatus, 10000);

  // Return cleanup function
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
    clearInterval(checkInterval);
  };
}

/**
 * Check if connection is suitable for a specific operation
 */
export async function canPerformOperation(
  operationType: 'card' | 'wallet' | 'bank' | 'qr' | 'ussd'
): Promise<boolean> {
  const status = await detectNetworkStatus();

  switch (operationType) {
    case 'card':
    case 'wallet':
    case 'bank':
      // These require online connection
      return status.isOnline && status.quality !== 'offline';

    case 'qr':
    case 'ussd':
      // These work offline
      return true;

    default:
      return status.isOnline;
  }
}

/**
 * Get recommended payment methods based on network quality
 */
export async function getRecommendedMethods(
  availableMethods: Array<'card' | 'wallet' | 'bank' | 'qr' | 'ussd'>
): Promise<Array<'card' | 'wallet' | 'bank' | 'qr' | 'ussd'>> {
  const status = await detectNetworkStatus();

  if (!status.isOnline || status.quality === 'offline') {
    // Offline: only QR and USSD
    return availableMethods.filter((m) => m === 'qr' || m === 'ussd');
  }

  if (status.quality === 'poor') {
    // Poor connection: prioritize simpler methods
    return availableMethods.sort((a, b) => {
      const priority = { ussd: 1, qr: 2, wallet: 3, bank: 4, card: 5 };
      return (priority[a] || 99) - (priority[b] || 99);
    });
  }

  // Good connection: return as-is
  return availableMethods;
}

/**
 * Connection type detection (if available via Network Information API)
 */
export function getConnectionType(): string | null {
  if (typeof navigator === 'undefined') return null;

  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (connection && connection.effectiveType) {
    return connection.effectiveType; // '4g', '3g', '2g', 'slow-2g'
  }

  return null;
}

/**
 * Estimate if user is on metered connection
 */
export function isMeteredConnection(): boolean {
  if (typeof navigator === 'undefined') return false;

  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (connection && connection.saveData !== undefined) {
    return connection.saveData === true;
  }

  return false;
}

/**
 * Preflight check before making payment
 */
export async function preflightCheck(): Promise<{
  canProceed: boolean;
  warnings: string[];
  recommendations: string[];
}> {
  const status = await detectNetworkStatus();
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (!status.isOnline) {
    warnings.push('No internet connection detected');
    recommendations.push('Use QR or USSD payment methods');
    return { canProceed: false, warnings, recommendations };
  }

  if (status.quality === 'poor') {
    warnings.push('Slow internet connection');
    recommendations.push('Consider using QR or USSD for faster processing');
  }

  if (isMeteredConnection()) {
    recommendations.push('You are on a metered connection - data charges may apply');
  }

  return {
    canProceed: true,
    warnings,
    recommendations,
  };
}
