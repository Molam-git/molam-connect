// =====================================================================
// Redis Client for Rate Limiting
// =====================================================================
// Configured Redis client with Lua script loader
// Date: 2025-11-12
// =====================================================================

import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';

// =====================================================================
// Configuration
// =====================================================================

const REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB_RATE_LIMIT || '1', 10), // Use separate DB for rate limiting
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  enableReadyCheck: true,
  enableOfflineQueue: true,
  lazyConnect: false,
};

// Cluster configuration (if using Redis Cluster)
const REDIS_CLUSTER_NODES = process.env.REDIS_CLUSTER_NODES
  ? process.env.REDIS_CLUSTER_NODES.split(',').map((node) => {
      const [host, port] = node.split(':');
      return { host, port: parseInt(port, 10) };
    })
  : null;

// =====================================================================
// Redis Client Singleton
// =====================================================================

class RateLimitRedis {
  private client: RedisClient | null = null;
  private tokenBucketScriptSha: string | null = null;
  private isReady: boolean = false;

  /**
   * Initialize Redis client
   */
  async initialize(): Promise<void> {
    if (this.client && this.isReady) {
      return; // Already initialized
    }

    try {
      // Create Redis client (cluster or standalone)
      if (REDIS_CLUSTER_NODES) {
        console.log('[RateLimitRedis] Connecting to Redis Cluster...');
        this.client = new Redis.Cluster(REDIS_CLUSTER_NODES, {
          redisOptions: REDIS_CONFIG,
        });
      } else {
        console.log('[RateLimitRedis] Connecting to Redis standalone...');
        this.client = new Redis(REDIS_CONFIG);
      }

      // Event handlers
      this.client.on('connect', () => {
        console.log('[RateLimitRedis] Connected to Redis');
      });

      this.client.on('ready', async () => {
        console.log('[RateLimitRedis] Redis ready');
        this.isReady = true;

        // Load Lua scripts
        await this.loadScripts();
      });

      this.client.on('error', (err) => {
        console.error('[RateLimitRedis] Redis error:', err);
        this.isReady = false;
      });

      this.client.on('close', () => {
        console.log('[RateLimitRedis] Redis connection closed');
        this.isReady = false;
      });

      this.client.on('reconnecting', () => {
        console.log('[RateLimitRedis] Redis reconnecting...');
        this.isReady = false;
      });

      // Wait for ready
      if (this.client.status !== 'ready') {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Redis connection timeout'));
          }, 10000);

          this.client!.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });

          this.client!.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      }
    } catch (error) {
      console.error('[RateLimitRedis] Failed to initialize Redis:', error);
      throw error;
    }
  }

  /**
   * Load Lua scripts into Redis
   */
  private async loadScripts(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      // Load token bucket script
      const scriptPath = join(__dirname, '../lua/token-bucket.lua');
      const scriptContent = readFileSync(scriptPath, 'utf8');

      console.log('[RateLimitRedis] Loading token bucket Lua script...');
      this.tokenBucketScriptSha = await this.client.script('LOAD', scriptContent);
      console.log('[RateLimitRedis] Token bucket script SHA:', this.tokenBucketScriptSha);
    } catch (error) {
      console.error('[RateLimitRedis] Failed to load Lua scripts:', error);
      throw error;
    }
  }

  /**
   * Get Redis client
   */
  getClient(): RedisClient {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Get token bucket script SHA
   */
  getTokenBucketScriptSha(): string {
    if (!this.tokenBucketScriptSha) {
      throw new Error('Token bucket script not loaded. Call initialize() first.');
    }
    return this.tokenBucketScriptSha;
  }

  /**
   * Check if Redis is ready
   */
  isClientReady(): boolean {
    return this.isReady && this.client !== null;
  }

  /**
   * Execute token bucket rate limit check
   */
  async checkRateLimit(params: {
    keyId: string;
    now?: number;
    amount?: number;
    ratePerSecond: number;
    burstCapacity: number;
    dailyQuota: number;
    monthlyQuota: number;
    idempotencyKey?: string;
  }): Promise<{
    allowed: boolean;
    tokensRemaining: number;
    retryAfter: number;
    dailyCount: number;
    monthlyCount: number;
    reason: string;
  }> {
    if (!this.isClientReady()) {
      throw new Error('Redis not ready');
    }

    const now = params.now || Date.now();
    const amount = params.amount || 1;
    const date = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
    const month = new Date(now).toISOString().slice(0, 7); // YYYY-MM
    const idempotencyKey = params.idempotencyKey || '';

    // Redis keys
    const keyTb = `rl:tb:${params.keyId}`;
    const keyQuotaDaily = `rl:quota:${params.keyId}:${date}`;
    const keyQuotaMonthly = `rl:quota_monthly:${params.keyId}:${month}`;

    try {
      // Execute Lua script
      const result = await this.client!.evalsha(
        this.tokenBucketScriptSha!,
        3, // Number of keys
        keyTb,
        keyQuotaDaily,
        keyQuotaMonthly,
        now.toString(),
        amount.toString(),
        params.ratePerSecond.toString(),
        params.burstCapacity.toString(),
        params.dailyQuota.toString(),
        params.monthlyQuota.toString(),
        idempotencyKey
      ) as [number, number, number, number, number, string];

      return {
        allowed: result[0] === 1,
        tokensRemaining: result[1],
        retryAfter: result[2],
        dailyCount: result[3],
        monthlyCount: result[4],
        reason: result[5],
      };
    } catch (error: any) {
      // Handle NOSCRIPT error (script not loaded)
      if (error.message && error.message.includes('NOSCRIPT')) {
        console.warn('[RateLimitRedis] Script not found, reloading...');
        await this.loadScripts();
        // Retry once
        return this.checkRateLimit(params);
      }

      console.error('[RateLimitRedis] Rate limit check failed:', error);
      throw error;
    }
  }

  /**
   * Get current rate limit status (without consuming tokens)
   */
  async getRateLimitStatus(keyId: string): Promise<{
    tokensAvailable: number;
    dailyUsage: number;
    monthlyUsage: number;
    lastUpdate: number;
  }> {
    if (!this.isClientReady()) {
      throw new Error('Redis not ready');
    }

    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const month = new Date(now).toISOString().slice(0, 7);

    const keyTb = `rl:tb:${keyId}`;
    const keyQuotaDaily = `rl:quota:${keyId}:${date}`;
    const keyQuotaMonthly = `rl:quota_monthly:${keyId}:${month}`;

    try {
      const [tbData, dailyUsage, monthlyUsage] = await Promise.all([
        this.client!.hmget(keyTb, 'tokens', 'last_ts'),
        this.client!.get(keyQuotaDaily),
        this.client!.get(keyQuotaMonthly),
      ]);

      return {
        tokensAvailable: tbData[0] ? parseFloat(tbData[0]) : 0,
        dailyUsage: dailyUsage ? parseInt(dailyUsage, 10) : 0,
        monthlyUsage: monthlyUsage ? parseInt(monthlyUsage, 10) : 0,
        lastUpdate: tbData[1] ? parseInt(tbData[1], 10) : now,
      };
    } catch (error) {
      console.error('[RateLimitRedis] Failed to get status:', error);
      throw error;
    }
  }

  /**
   * Reset rate limit for a key (admin/ops operation)
   */
  async resetRateLimit(keyId: string): Promise<void> {
    if (!this.isClientReady()) {
      throw new Error('Redis not ready');
    }

    const pattern = `rl:*${keyId}*`;

    try {
      // Scan and delete all keys matching pattern
      const stream = this.client!.scanStream({
        match: pattern,
        count: 100,
      });

      const keysToDelete: string[] = [];

      stream.on('data', (keys: string[]) => {
        keysToDelete.push(...keys);
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      if (keysToDelete.length > 0) {
        await this.client!.del(...keysToDelete);
        console.log(`[RateLimitRedis] Reset ${keysToDelete.length} keys for ${keyId}`);
      }
    } catch (error) {
      console.error('[RateLimitRedis] Failed to reset rate limit:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    if (!this.isClientReady()) {
      return { healthy: false, latency: 0, error: 'Redis not ready' };
    }

    try {
      const start = Date.now();
      await this.client!.ping();
      const latency = Date.now() - start;

      return { healthy: true, latency };
    } catch (error: any) {
      return { healthy: false, latency: 0, error: error.message };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isReady = false;
      console.log('[RateLimitRedis] Redis connection closed');
    }
  }
}

// =====================================================================
// Export Singleton
// =====================================================================

export const rateLimitRedis = new RateLimitRedis();

// Auto-initialize on import (optional, can be called explicitly)
if (process.env.NODE_ENV !== 'test') {
  rateLimitRedis.initialize().catch((error) => {
    console.error('[RateLimitRedis] Auto-initialization failed:', error);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[RateLimitRedis] SIGTERM received, closing Redis connection...');
  await rateLimitRedis.close();
});

process.on('SIGINT', async () => {
  console.log('[RateLimitRedis] SIGINT received, closing Redis connection...');
  await rateLimitRedis.close();
});
