/**
 * BIN Lookup Service
 *
 * Determines card capabilities including 3DS2 support
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { RedisService } from './redis';

export interface BinLookupResponse {
  bin: string;
  scheme: 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'diners' | 'unionpay' | 'unknown';
  type: 'credit' | 'debit' | 'prepaid' | 'unknown';
  brand: string;
  issuer: {
    name?: string;
    country?: string;
    phone?: string;
    website?: string;
  };
  supports_3ds2: boolean;
  supports_3ds1: boolean;
  acs_url?: string;
  acs_version?: string;
}

class BinLookupService {
  private client: AxiosInstance;
  private cache: RedisService;
  private cacheTTL: number = 86400; // 24 hours

  constructor() {
    this.client = axios.create({
      baseURL: process.env.BIN_LOOKUP_API_URL || 'https://binlist.molam.com',
      timeout: 2000,
      headers: {
        'Authorization': `Bearer ${process.env.BIN_LOOKUP_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    this.cache = new RedisService();
  }

  /**
   * Lookup BIN information with caching
   */
  async lookup(bin: string, country?: string): Promise<BinLookupResponse> {
    // Validate BIN format (6-8 digits)
    if (!bin || bin.length < 6) {
      throw new Error('Invalid BIN: must be at least 6 digits');
    }

    const normalizedBin = bin.substring(0, 8);
    const cacheKey = `bin:${normalizedBin}:${country || 'global'}`;

    try {
      // Check cache first
      const cached = await this.cache.get<BinLookupResponse>(cacheKey);
      if (cached) {
        logger.debug({ bin: normalizedBin }, 'BIN lookup cache hit');
        return cached;
      }

      // Fetch from API
      const response = await this.client.get<BinLookupResponse>(`/v1/bin/${normalizedBin}`, {
        params: { country },
      });

      const result = response.data;

      // Determine 3DS support based on scheme and issuer
      result.supports_3ds2 = this.detect3DS2Support(result);
      result.supports_3ds1 = this.detect3DS1Support(result);

      // Cache result
      await this.cache.set(cacheKey, result, this.cacheTTL);

      logger.info({
        bin: normalizedBin,
        scheme: result.scheme,
        supports_3ds2: result.supports_3ds2,
      }, 'BIN lookup successful');

      return result;
    } catch (error: any) {
      logger.error({
        error: error.message,
        bin: normalizedBin,
      }, 'BIN lookup failed');

      // Return fallback response
      return this.getFallbackResponse(normalizedBin);
    }
  }

  /**
   * Detect 3DS2 support based on BIN data
   */
  private detect3DS2Support(binData: BinLookupResponse): boolean {
    // Visa, Mastercard generally support 3DS2
    if (['visa', 'mastercard', 'amex'].includes(binData.scheme)) {
      // Check issuer country for 3DS2 rollout status
      const supported3DS2Countries = [
        'US', 'GB', 'FR', 'DE', 'IT', 'ES', 'CA', 'AU',
        'SN', 'CI', 'BJ', 'TG', 'ML', 'BF', // West Africa
      ];

      if (binData.issuer.country && supported3DS2Countries.includes(binData.issuer.country)) {
        return true;
      }

      // Default to true for major schemes after 2020
      return true;
    }

    // Other schemes may have limited support
    return binData.scheme === 'discover' || binData.scheme === 'jcb';
  }

  /**
   * Detect 3DS1 support (legacy)
   */
  private detect3DS1Support(binData: BinLookupResponse): boolean {
    // Most cards support 3DS1 as fallback
    return ['visa', 'mastercard', 'amex', 'discover', 'jcb'].includes(binData.scheme);
  }

  /**
   * Fallback response when BIN lookup fails
   */
  private getFallbackResponse(bin: string): BinLookupResponse {
    // Determine scheme from BIN prefix
    const firstDigit = bin[0];
    let scheme: BinLookupResponse['scheme'] = 'unknown';

    if (firstDigit === '4') scheme = 'visa';
    else if (['5', '2'].includes(firstDigit)) scheme = 'mastercard';
    else if (firstDigit === '3') scheme = 'amex';
    else if (firstDigit === '6') scheme = 'discover';

    return {
      bin,
      scheme,
      type: 'unknown',
      brand: scheme,
      issuer: {},
      supports_3ds2: ['visa', 'mastercard'].includes(scheme), // Conservative fallback
      supports_3ds1: true,
    };
  }

  /**
   * Batch lookup multiple BINs
   */
  async batchLookup(bins: string[], country?: string): Promise<BinLookupResponse[]> {
    const promises = bins.map((bin) => this.lookup(bin, country));
    return Promise.all(promises);
  }
}

export const binLookupService = new BinLookupService();
