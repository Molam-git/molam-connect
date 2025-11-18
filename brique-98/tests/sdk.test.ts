/**
 * Brique 98 — Offline SDK Tests
 *
 * Tests for POS/mobile SDK functionality including transaction creation,
 * bundle signing, and sync operations.
 */

import { OfflineSDK, Storage, CreateTransactionParams } from '../src/sdk/offline-sdk';
import { generateECDSAKeyPair } from '../src/offline/security';

// Mock storage implementation
class MockStorage implements Storage {
  private store: Map<string, string> = new Map();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Mock fetch
global.fetch = jest.fn();

describe('Offline SDK', () => {
  let sdk: OfflineSDK;
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
    sdk = new OfflineSDK({
      apiUrl: 'https://api.test.molam.com',
      deviceId: 'TEST_DEVICE_001',
      storage,
      autoSync: false, // Disable auto-sync for tests
      tenantType: 'merchant',
      tenantId: 'merchant_123',
    });

    (fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    sdk.destroy();
    storage.clear();
  });

  describe('Initialization', () => {
    test('should initialize SDK', async () => {
      await sdk.initialize();

      // Check that keys were generated
      const privateKey = await storage.getItem('offline_device_private_key');
      const publicKey = await storage.getItem('offline_device_public_key');

      expect(privateKey).toBeTruthy();
      expect(publicKey).toBeTruthy();
      expect(privateKey).toContain('BEGIN PRIVATE KEY');
      expect(publicKey).toContain('BEGIN PUBLIC KEY');
    });

    test('should reuse existing keys on subsequent initialization', async () => {
      await sdk.initialize();

      const privateKey1 = await storage.getItem('offline_device_private_key');
      const publicKey1 = await storage.getItem('offline_device_public_key');

      // Re-initialize
      const sdk2 = new OfflineSDK({
        apiUrl: 'https://api.test.molam.com',
        deviceId: 'TEST_DEVICE_001',
        storage,
        autoSync: false,
      });

      await sdk2.initialize();

      const privateKey2 = await storage.getItem('offline_device_private_key');
      const publicKey2 = await storage.getItem('offline_device_public_key');

      expect(privateKey1).toBe(privateKey2);
      expect(publicKey1).toBe(publicKey2);

      sdk2.destroy();
    });
  });

  describe('Device Registration', () => {
    test('should register device successfully', async () => {
      await sdk.initialize();

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          device: {
            id: 'device_uuid',
            device_id: 'TEST_DEVICE_001',
            tenant_type: 'merchant',
          },
        }),
      });

      const result = await sdk.registerDevice('test_api_token');

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.molam.com/offline/devices',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test_api_token',
          }),
        })
      );
    });

    test('should handle registration failure', async () => {
      await sdk.initialize();

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Device already registered' }),
      });

      const result = await sdk.registerDevice('test_api_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Device already registered');
    });

    test('should return public key', async () => {
      await sdk.initialize();

      const publicKey = sdk.getPublicKey();

      expect(publicKey).toBeTruthy();
      expect(publicKey).toContain('BEGIN PUBLIC KEY');
    });
  });

  describe('Offline Transaction Creation', () => {
    beforeEach(async () => {
      await sdk.initialize();
    });

    test('should create offline transaction', async () => {
      const params: CreateTransactionParams = {
        type: 'p2p',
        amount: 5000,
        currency: 'XOF',
        sender: 'user_123',
        receiver: 'user_456',
      };

      const result = await sdk.createOfflineTransaction(params);

      expect(result.success).toBe(true);
      expect(result.localId).toBeTruthy();
      expect(result.localId).toContain('TEST_DEVICE_001');
    });

    test('should store transaction in pending list', async () => {
      const params: CreateTransactionParams = {
        type: 'merchant',
        amount: 10000,
        currency: 'XOF',
        sender: 'user_123',
        receiver: 'merchant_456',
        merchant_id: 'merchant_456',
      };

      await sdk.createOfflineTransaction(params);

      const pendingCount = sdk.getPendingCount();
      expect(pendingCount).toBe(1);

      const pendingTx = sdk.getPendingTransactions();
      expect(pendingTx.length).toBe(1);
      expect(pendingTx[0].amount).toBe(10000);
      expect(pendingTx[0].type).toBe('merchant');
    });

    test('should persist pending transactions to storage', async () => {
      const params: CreateTransactionParams = {
        type: 'p2p',
        amount: 2000,
        currency: 'XOF',
        sender: 'user_123',
        receiver: 'user_789',
      };

      await sdk.createOfflineTransaction(params);

      // Check storage
      const txStr = await storage.getItem('offline_pending_transactions');
      expect(txStr).toBeTruthy();

      const transactions = JSON.parse(txStr!);
      expect(transactions.length).toBe(1);
      expect(transactions[0].amount).toBe(2000);
    });

    test('should handle multiple transactions', async () => {
      for (let i = 0; i < 5; i++) {
        await sdk.createOfflineTransaction({
          type: 'p2p',
          amount: 1000 * (i + 1),
          currency: 'XOF',
          sender: 'user_123',
          receiver: `user_${i}`,
        });
      }

      const pendingCount = sdk.getPendingCount();
      expect(pendingCount).toBe(5);

      const pendingTx = sdk.getPendingTransactions();
      expect(pendingTx.length).toBe(5);
    });
  });

  describe('Bundle Sync', () => {
    beforeEach(async () => {
      await sdk.initialize();
    });

    test('should sync pending transactions successfully', async () => {
      // Create pending transaction
      await sdk.createOfflineTransaction({
        type: 'p2p',
        amount: 5000,
        currency: 'XOF',
        sender: 'user_123',
        receiver: 'user_456',
      });

      // Mock successful push
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          bundle_id: 'bundle_123',
          status: 'accepted',
        }),
      });

      const result = await sdk.syncNow();

      expect(result.success).toBe(true);
      expect(result.bundlesPushed).toBe(1);
      expect(result.bundlesFailed).toBe(0);

      // Pending transactions should be cleared
      expect(sdk.getPendingCount()).toBe(0);
    });

    test('should handle sync failure', async () => {
      // Create pending transaction
      await sdk.createOfflineTransaction({
        type: 'p2p',
        amount: 5000,
        currency: 'XOF',
        sender: 'user_123',
        receiver: 'user_456',
      });

      // Mock failed push
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid signature' }),
      });

      const result = await sdk.syncNow();

      expect(result.success).toBe(false);
      expect(result.bundlesPushed).toBe(0);
      expect(result.bundlesFailed).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);

      // Pending transactions should NOT be cleared
      expect(sdk.getPendingCount()).toBe(1);
    });

    test('should return success if no pending transactions', async () => {
      const result = await sdk.syncNow();

      expect(result.success).toBe(true);
      expect(result.bundlesPushed).toBe(0);
      expect(result.bundlesFailed).toBe(0);
    });

    test('should include correct request payload', async () => {
      // Create pending transaction
      await sdk.createOfflineTransaction({
        type: 'p2p',
        amount: 5000,
        currency: 'XOF',
        sender: 'user_123',
        receiver: 'user_456',
      });

      // Mock successful push
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          bundle_id: 'bundle_123',
          status: 'accepted',
        }),
      });

      await sdk.syncNow();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.molam.com/offline/push',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('bundle_id'),
        })
      );

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body).toHaveProperty('device_id', 'TEST_DEVICE_001');
      expect(body).toHaveProperty('bundle_id');
      expect(body).toHaveProperty('encrypted_payload');
      expect(body).toHaveProperty('signature');
      expect(body).toHaveProperty('device_clock');
    });
  });

  describe('QR Code Generation', () => {
    beforeEach(async () => {
      await sdk.initialize();
    });

    test('should generate QR code for pending transactions', async () => {
      // Create pending transaction
      await sdk.createOfflineTransaction({
        type: 'p2p',
        amount: 5000,
        currency: 'XOF',
        sender: 'user_123',
        receiver: 'user_456',
      });

      const result = await sdk.generateOfflineQR();

      expect(result.success).toBe(true);
      expect(result.qrData).toBeTruthy();
      expect(result.qrData).toContain('molam://offline/');
    });

    test('should fail if no pending transactions', async () => {
      const result = await sdk.generateOfflineQR();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No pending transactions');
    });

    test('should include bundle data in QR', async () => {
      await sdk.createOfflineTransaction({
        type: 'p2p',
        amount: 5000,
        currency: 'XOF',
        sender: 'user_123',
        receiver: 'user_456',
      });

      const result = await sdk.generateOfflineQR();

      expect(result.qrData).toContain('payload=');
      expect(result.qrData).toContain('sig=');
      expect(result.qrData).toContain('clock=');
    });
  });
});
