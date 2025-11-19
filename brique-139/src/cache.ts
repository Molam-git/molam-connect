/**
 * BRIQUE 139 — Internationalisation & Accessibilité
 * Redis caching layer for translations and currency formats
 */

import Redis from 'ioredis';
import type {
  CachedTranslations,
  CachedCurrencyFormats,
  CachedRegionalSettings,
} from './types';

let redis: Redis | null = null;

/**
 * Initialize Redis connection
 */
export function initializeRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
    });

    redis.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });
  }
  return redis;
}

/**
 * Get Redis client instance
 */
export function getRedis(): Redis {
  if (!redis) {
    return initializeRedis();
  }
  return redis;
}

/**
 * Cache key builders
 */
export const CacheKeys = {
  translations: (lang: string, module: string) => `i18n:translations:${lang}:${module}`,
  allTranslations: (lang: string) => `i18n:translations:${lang}:*`,
  currencyFormat: (code: string) => `i18n:currency:${code}`,
  regionalSettings: (countryCode: string) => `i18n:region:${countryCode}`,
  languages: () => 'i18n:languages',
  translationStats: () => 'i18n:stats',
};

/**
 * Default TTL values (in seconds)
 */
export const CacheTTL = {
  translations: 3600, // 1 hour
  currencyFormats: 86400, // 24 hours
  regionalSettings: 43200, // 12 hours
  languages: 86400, // 24 hours
  stats: 300, // 5 minutes
};

/**
 * Get cached translations
 */
export async function getCachedTranslations(
  lang: string,
  module: string
): Promise<Record<string, string> | null> {
  try {
    const client = getRedis();
    const key = CacheKeys.translations(lang, module);
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[Cache] Error getting translations:', error);
    return null;
  }
}

/**
 * Set cached translations
 */
export async function setCachedTranslations(
  lang: string,
  module: string,
  translations: Record<string, string>,
  ttl: number = CacheTTL.translations
): Promise<void> {
  try {
    const client = getRedis();
    const key = CacheKeys.translations(lang, module);
    await client.setex(key, ttl, JSON.stringify(translations));
  } catch (error) {
    console.error('[Cache] Error setting translations:', error);
  }
}

/**
 * Invalidate translation cache
 */
export async function invalidateTranslationCache(
  lang?: string,
  module?: string
): Promise<void> {
  try {
    const client = getRedis();
    if (lang && module) {
      const key = CacheKeys.translations(lang, module);
      await client.del(key);
    } else if (lang) {
      const pattern = CacheKeys.allTranslations(lang);
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } else {
      const pattern = 'i18n:translations:*';
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  } catch (error) {
    console.error('[Cache] Error invalidating translation cache:', error);
  }
}

/**
 * Get cached currency format
 */
export async function getCachedCurrencyFormat(
  code: string
): Promise<any | null> {
  try {
    const client = getRedis();
    const key = CacheKeys.currencyFormat(code);
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[Cache] Error getting currency format:', error);
    return null;
  }
}

/**
 * Set cached currency format
 */
export async function setCachedCurrencyFormat(
  code: string,
  format: any,
  ttl: number = CacheTTL.currencyFormats
): Promise<void> {
  try {
    const client = getRedis();
    const key = CacheKeys.currencyFormat(code);
    await client.setex(key, ttl, JSON.stringify(format));
  } catch (error) {
    console.error('[Cache] Error setting currency format:', error);
  }
}

/**
 * Get cached regional settings
 */
export async function getCachedRegionalSettings(
  countryCode: string
): Promise<any | null> {
  try {
    const client = getRedis();
    const key = CacheKeys.regionalSettings(countryCode);
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[Cache] Error getting regional settings:', error);
    return null;
  }
}

/**
 * Set cached regional settings
 */
export async function setCachedRegionalSettings(
  countryCode: string,
  settings: any,
  ttl: number = CacheTTL.regionalSettings
): Promise<void> {
  try {
    const client = getRedis();
    const key = CacheKeys.regionalSettings(countryCode);
    await client.setex(key, ttl, JSON.stringify(settings));
  } catch (error) {
    console.error('[Cache] Error setting regional settings:', error);
  }
}

/**
 * Get cached languages
 */
export async function getCachedLanguages(): Promise<any[] | null> {
  try {
    const client = getRedis();
    const key = CacheKeys.languages();
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[Cache] Error getting languages:', error);
    return null;
  }
}

/**
 * Set cached languages
 */
export async function setCachedLanguages(
  languages: any[],
  ttl: number = CacheTTL.languages
): Promise<void> {
  try {
    const client = getRedis();
    const key = CacheKeys.languages();
    await client.setex(key, ttl, JSON.stringify(languages));
  } catch (error) {
    console.error('[Cache] Error setting languages:', error);
  }
}

/**
 * Increment translation usage counter
 */
export async function incrementTranslationUsage(
  lang: string,
  module: string,
  key: string
): Promise<void> {
  try {
    const client = getRedis();
    const statsKey = `i18n:usage:${lang}:${module}:${key}`;
    await client.incr(statsKey);
    await client.expire(statsKey, 86400); // 24 hours
  } catch (error) {
    console.error('[Cache] Error incrementing translation usage:', error);
  }
}

/**
 * Get translation usage stats
 */
export async function getTranslationUsageStats(
  lang: string,
  module?: string
): Promise<Record<string, number>> {
  try {
    const client = getRedis();
    const pattern = module
      ? `i18n:usage:${lang}:${module}:*`
      : `i18n:usage:${lang}:*`;
    const keys = await client.keys(pattern);

    const stats: Record<string, number> = {};
    if (keys.length > 0) {
      const values = await client.mget(...keys);
      keys.forEach((key, index) => {
        const count = parseInt(values[index] || '0', 10);
        stats[key] = count;
      });
    }

    return stats;
  } catch (error) {
    console.error('[Cache] Error getting translation usage stats:', error);
    return {};
  }
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

/**
 * Redis health check
 */
export async function redisHealthCheck(): Promise<boolean> {
  try {
    const client = getRedis();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis] Health check failed:', error);
    return false;
  }
}
