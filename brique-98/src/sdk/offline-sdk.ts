/**
 * Brique 98 — Offline Payments SDK
 *
 * Client SDK for POS terminals and mobile apps to handle offline payments.
 *
 * Features:
 * - Device registration and key management
 * - Offline bundle creation and signing
 * - Local storage of transactions
 * - Automatic sync when connectivity returns
 * - QR code generation for offline payments
 *
 * Usage:
 * ```typescript
 * import { OfflineSDK } from '@molam/brique-98/sdk';
 *
 * const sdk = new OfflineSDK({
 *   apiUrl: 'https://api.molam.com',
 *   deviceId: 'POS-001',
 *   storage: AsyncStorage, // or localStorage
 * });
 *
 * await sdk.initialize();
 * await sdk.createOfflineTransaction({ ... });
 * await sdk.syncWhenOnline();
 * ```
 */

import crypto from 'crypto';
import {
  generateNonce,
  signPayload,
  encryptBundle,
  generateECDSAKeyPair,
  BundlePayload,
  OfflineTransaction,
} from '../offline/security';

// =====================================================================
// Configuration & Types
// =====================================================================

export interface SDKConfig {
  apiUrl: string; // Base API URL (e.g., https://api.molam.com)
  deviceId: string; // Unique device identifier
  storage: Storage; // Storage interface (localStorage, AsyncStorage, etc.)
  tenantType?: 'merchant' | 'agent' | 'internal';
  tenantId?: string;
  country?: string;
  currency?: string;
  autoSync?: boolean; // Auto-sync when online (default: true)
  syncIntervalMs?: number; // Sync check interval (default: 60000)
}

export interface Storage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface CreateTransactionParams {
  type: 'p2p' | 'merchant' | 'cashin' | 'cashout' | 'agent';
  amount: number;
  currency: string;
  sender: string; // User ID or phone
  receiver: string; // User ID, merchant ID, or phone
  merchant_id?: string;
  meta?: Record<string, any>;
}

export interface SyncResult {
  success: boolean;
  bundlesPushed: number;
  bundlesFailed: number;
  errors: string[];
}

// =====================================================================
// Offline SDK Class
// =====================================================================

export class OfflineSDK {
  private config: SDKConfig;
  private privateKey: string | null = null;
  private publicKey: string | null = null;
  private pendingTransactions: OfflineTransaction[] = [];
  private syncTimer: NodeJS.Timeout | null = null;
  private isOnline: boolean = true;

  constructor(config: SDKConfig) {
    this.config = {
      autoSync: true,
      syncIntervalMs: 60000,
      ...config,
    };
  }

  // ===================================================================
  // Initialization
  // ===================================================================

  /**
   * Initialize SDK
   *
   * - Load or generate device keys
   * - Load pending transactions from storage
   * - Start auto-sync if enabled
   */
  async initialize(): Promise<void> {
    console.log('[OfflineSDK] Initializing...');

    // Load or generate device keys
    await this.loadOrGenerateKeys();

    // Load pending transactions
    await this.loadPendingTransactions();

    // Start auto-sync
    if (this.config.autoSync) {
      this.startAutoSync();
    }

    // Listen for online/offline events (browser only)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnlineStatusChange(true));
      window.addEventListener('offline', () => this.handleOnlineStatusChange(false));
      this.isOnline = navigator.onLine;
    }

    console.log('[OfflineSDK] Initialized successfully');
  }

  /**
   * Load or generate ECDSA key pair
   */
  private async loadOrGenerateKeys(): Promise<void> {
    const privateKeyStr = await this.config.storage.getItem('offline_device_private_key');
    const publicKeyStr = await this.config.storage.getItem('offline_device_public_key');

    if (privateKeyStr && publicKeyStr) {
      this.privateKey = privateKeyStr;
      this.publicKey = publicKeyStr;
      console.log('[OfflineSDK] Loaded existing keys');
    } else {
      const keyPair = generateECDSAKeyPair();
      this.privateKey = keyPair.privateKey;
      this.publicKey = keyPair.publicKey;

      await this.config.storage.setItem('offline_device_private_key', this.privateKey);
      await this.config.storage.setItem('offline_device_public_key', this.publicKey);

      console.log('[OfflineSDK] Generated new key pair');
    }
  }

  /**
   * Load pending transactions from storage
   */
  private async loadPendingTransactions(): Promise<void> {
    const txStr = await this.config.storage.getItem('offline_pending_transactions');

    if (txStr) {
      this.pendingTransactions = JSON.parse(txStr);
      console.log(`[OfflineSDK] Loaded ${this.pendingTransactions.length} pending transactions`);
    }
  }

  /**
   * Save pending transactions to storage
   */
  private async savePendingTransactions(): Promise<void> {
    await this.config.storage.setItem(
      'offline_pending_transactions',
      JSON.stringify(this.pendingTransactions)
    );
  }

  // ===================================================================
  // Device Registration
  // ===================================================================

  /**
   * Register device with server
   *
   * Requires admin API token for authentication
   */
  async registerDevice(apiToken: string): Promise<{ success: boolean; error?: string }> {
    if (!this.publicKey) {
      return { success: false, error: 'Public key not initialized' };
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/offline/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          device_id: this.config.deviceId,
          tenant_type: this.config.tenantType || 'merchant',
          tenant_id: this.config.tenantId,
          pubkey_pem: this.publicKey,
          country: this.config.country,
          currency_default: this.config.currency,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Registration failed' };
      }

      const result = await response.json();
      console.log('[OfflineSDK] Device registered successfully:', result.device);

      return { success: true };
    } catch (error: any) {
      console.error('[OfflineSDK] Registration error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get device public key (for registration)
   */
  getPublicKey(): string | null {
    return this.publicKey;
  }

  // ===================================================================
  // Offline Transaction Creation
  // ===================================================================

  /**
   * Create offline transaction
   *
   * Stores transaction locally and will sync when online
   */
  async createOfflineTransaction(params: CreateTransactionParams): Promise<{
    success: boolean;
    localId: string;
    error?: string;
  }> {
    try {
      const transaction: OfflineTransaction = {
        local_id: `${this.config.deviceId}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        type: params.type,
        amount: params.amount,
        currency: params.currency,
        sender: params.sender,
        receiver: params.receiver,
        merchant_id: params.merchant_id,
        initiated_at: new Date().toISOString(),
        meta: params.meta,
      };

      this.pendingTransactions.push(transaction);
      await this.savePendingTransactions();

      console.log(`[OfflineSDK] Created offline transaction: ${transaction.local_id}`);

      // Trigger sync if online
      if (this.isOnline && this.config.autoSync) {
        setTimeout(() => this.syncNow(), 1000);
      }

      return {
        success: true,
        localId: transaction.local_id,
      };
    } catch (error: any) {
      console.error('[OfflineSDK] Create transaction error:', error);
      return {
        success: false,
        localId: '',
        error: error.message,
      };
    }
  }

  /**
   * Get pending transactions count
   */
  getPendingCount(): number {
    return this.pendingTransactions.length;
  }

  /**
   * Get all pending transactions
   */
  getPendingTransactions(): OfflineTransaction[] {
    return [...this.pendingTransactions];
  }

  // ===================================================================
  // Bundle Creation & Signing
  // ===================================================================

  /**
   * Create and sign offline bundle
   */
  private async createBundle(): Promise<{
    bundle_id: string;
    encrypted_payload: string;
    signature: string;
    device_clock: string;
  } | null> {
    if (this.pendingTransactions.length === 0) {
      return null;
    }

    if (!this.privateKey) {
      throw new Error('Private key not initialized');
    }

    try {
      // Create bundle payload
      const bundlePayload: BundlePayload = {
        bundle_id: `${this.config.deviceId}_bundle_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
        transactions: this.pendingTransactions,
        nonce: generateNonce(),
        device_clock: new Date().toISOString(),
        device_id: this.config.deviceId,
        metadata: {
          device_type: 'pos', // or 'mobile'
          sdk_version: '1.0.0',
        },
      };

      // Encrypt bundle
      const encryptedBundle = await encryptBundle(bundlePayload);
      const encryptedPayloadStr = JSON.stringify(encryptedBundle);
      const payloadBuffer = Buffer.from(encryptedPayloadStr, 'utf8');

      // Sign encrypted payload
      const signature = signPayload(this.privateKey, payloadBuffer);

      return {
        bundle_id: bundlePayload.bundle_id,
        encrypted_payload: payloadBuffer.toString('base64'),
        signature: signature.toString('base64'),
        device_clock: bundlePayload.device_clock,
      };
    } catch (error: any) {
      console.error('[OfflineSDK] Bundle creation error:', error);
      throw error;
    }
  }

  // ===================================================================
  // Sync to Server
  // ===================================================================

  /**
   * Sync pending transactions to server
   */
  async syncNow(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      bundlesPushed: 0,
      bundlesFailed: 0,
      errors: [],
    };

    if (this.pendingTransactions.length === 0) {
      result.success = true;
      return result;
    }

    try {
      // Create bundle
      const bundle = await this.createBundle();

      if (!bundle) {
        result.success = true;
        return result;
      }

      // Push to server
      const response = await fetch(`${this.config.apiUrl}/offline/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: this.config.deviceId,
          bundle_id: bundle.bundle_id,
          encrypted_payload: bundle.encrypted_payload,
          signature: bundle.signature,
          device_clock: bundle.device_clock,
        }),
      });

      if (response.ok) {
        const serverResult = await response.json();

        console.log(
          `[OfflineSDK] Bundle pushed successfully: ${bundle.bundle_id} (status: ${serverResult.status})`
        );

        // Clear pending transactions
        this.pendingTransactions = [];
        await this.savePendingTransactions();

        result.success = true;
        result.bundlesPushed = 1;
      } else {
        const error = await response.json();
        console.error('[OfflineSDK] Push failed:', error);

        result.bundlesFailed = 1;
        result.errors.push(error.error || 'Push failed');
      }

      return result;
    } catch (error: any) {
      console.error('[OfflineSDK] Sync error:', error);
      result.bundlesFailed = 1;
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Start auto-sync timer
   */
  private startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      if (this.isOnline && this.pendingTransactions.length > 0) {
        console.log('[OfflineSDK] Auto-sync triggered');
        this.syncNow().catch((error) => {
          console.error('[OfflineSDK] Auto-sync error:', error);
        });
      }
    }, this.config.syncIntervalMs);

    console.log(`[OfflineSDK] Auto-sync started (interval: ${this.config.syncIntervalMs}ms)`);
  }

  /**
   * Stop auto-sync timer
   */
  private stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('[OfflineSDK] Auto-sync stopped');
    }
  }

  /**
   * Handle online/offline status change
   */
  private handleOnlineStatusChange(online: boolean): void {
    console.log(`[OfflineSDK] Connection status: ${online ? 'online' : 'offline'}`);
    this.isOnline = online;

    if (online && this.pendingTransactions.length > 0) {
      console.log('[OfflineSDK] Back online - triggering sync');
      setTimeout(() => this.syncNow(), 2000);
    }
  }

  // ===================================================================
  // QR Code Generation
  // ===================================================================

  /**
   * Generate QR code data for offline payment
   *
   * Format: molam://offline/{bundle_id}?payload={encrypted_payload}&sig={signature}
   */
  async generateOfflineQR(): Promise<{
    success: boolean;
    qrData?: string;
    error?: string;
  }> {
    try {
      const bundle = await this.createBundle();

      if (!bundle) {
        return { success: false, error: 'No pending transactions' };
      }

      // Create QR data URL
      const qrData = `molam://offline/${bundle.bundle_id}?payload=${encodeURIComponent(
        bundle.encrypted_payload
      )}&sig=${encodeURIComponent(bundle.signature)}&clock=${encodeURIComponent(bundle.device_clock)}`;

      return {
        success: true,
        qrData,
      };
    } catch (error: any) {
      console.error('[OfflineSDK] QR generation error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ===================================================================
  // Cleanup
  // ===================================================================

  /**
   * Cleanup SDK resources
   */
  destroy(): void {
    this.stopAutoSync();

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', () => this.handleOnlineStatusChange(true));
      window.removeEventListener('offline', () => this.handleOnlineStatusChange(false));
    }

    console.log('[OfflineSDK] Destroyed');
  }
}

// =====================================================================
// Utility Functions
// =====================================================================

/**
 * Parse offline QR code data
 */
export function parseOfflineQR(qrData: string): {
  bundle_id: string;
  encrypted_payload: string;
  signature: string;
  device_clock: string;
} | null {
  try {
    const url = new URL(qrData);

    if (url.protocol !== 'molam:' || !url.pathname.startsWith('//offline/')) {
      return null;
    }

    const bundleId = url.pathname.substring(10); // Remove '//offline/'
    const payload = url.searchParams.get('payload');
    const sig = url.searchParams.get('sig');
    const clock = url.searchParams.get('clock');

    if (!bundleId || !payload || !sig || !clock) {
      return null;
    }

    return {
      bundle_id: bundleId,
      encrypted_payload: decodeURIComponent(payload),
      signature: decodeURIComponent(sig),
      device_clock: decodeURIComponent(clock),
    };
  } catch (error) {
    console.error('QR parse error:', error);
    return null;
  }
}

// =====================================================================
// Exports
// =====================================================================

export default OfflineSDK;
