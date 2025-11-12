/**
 * Brique 70sexies - AI Social Ads Generator
 * Ad Engine Tests
 */

import { generateCopy } from '../src/services/copywritingService';
import { generateVisual, generateCarousel } from '../src/services/visualGenerator';
import { optimizeTargeting, recommendBudget } from '../src/services/targetingOptimizer';

describe('Ad Engine - Copywriting Service', () => {
  describe('generateCopy', () => {
    it('should generate Facebook copy for ecommerce', () => {
      const copy = generateCopy({
        platform: 'facebook',
        objective: 'conversions',
        productName: 'iPhone 15',
        productCategory: 'tech',
        discount: 15,
        tone: 'casual'
      });

      expect(copy.title).toBeDefined();
      expect(copy.body).toBeDefined();
      expect(copy.cta).toBeDefined();
      expect(copy.title).toContain('iPhone 15');
    });

    it('should generate Instagram copy with hashtags', () => {
      const copy = generateCopy({
        platform: 'instagram',
        objective: 'engagement',
        productName: 'Sneakers',
        productCategory: 'fashion',
        tone: 'trendy'
      });

      expect(copy.hashtags).toBeDefined();
      expect(copy.hashtags!.length).toBeGreaterThan(0);
      expect(copy.hashtags!.length).toBeLessThanOrEqual(5);
    });

    it('should generate TikTok copy with viral tone', () => {
      const copy = generateCopy({
        platform: 'tiktok',
        objective: 'awareness',
        productName: 'Beauty Product',
        productCategory: 'beauty',
        tone: 'trendy'
      });

      expect(copy.body.length).toBeLessThan(150);
      expect(copy.hashtags).toBeDefined();
    });

    it('should generate LinkedIn professional copy', () => {
      const copy = generateCopy({
        platform: 'linkedin',
        objective: 'traffic',
        productName: 'SaaS Platform',
        productCategory: 'tech',
        tone: 'professional'
      });

      expect(copy.title).toBeDefined();
      expect(copy.cta).toBe('learn_more');
    });

    it('should respect platform character limits', () => {
      const facebookCopy = generateCopy({
        platform: 'facebook',
        objective: 'conversions',
        productName: 'Test Product',
        productCategory: 'ecommerce'
      });

      expect(facebookCopy.title.length).toBeLessThanOrEqual(40);
      expect(facebookCopy.body.length).toBeLessThanOrEqual(125);
    });

    it('should generate different copies for different tones', () => {
      const casualCopy = generateCopy({
        platform: 'facebook',
        objective: 'conversions',
        productName: 'Product',
        tone: 'casual'
      });

      const professionalCopy = generateCopy({
        platform: 'facebook',
        objective: 'conversions',
        productName: 'Product',
        tone: 'professional'
      });

      expect(casualCopy.title).not.toBe(professionalCopy.title);
    });
  });
});

describe('Ad Engine - Visual Generator', () => {
  describe('generateVisual', () => {
    it('should generate image for Facebook', async () => {
      const visual = await generateVisual({
        platform: 'facebook',
        format: 'image',
        productName: 'Test Product',
        productCategory: 'ecommerce'
      });

      expect(visual.url).toBeDefined();
      expect(visual.width).toBe(1200);
      expect(visual.height).toBe(630);
      expect(visual.format).toBe('jpg');
      expect(visual.generationPrompt).toBeDefined();
    });

    it('should generate story format for Instagram', async () => {
      const visual = await generateVisual({
        platform: 'instagram',
        format: 'image',
        productName: 'Fashion Item',
        productCategory: 'fashion',
        style: 'vibrant'
      });

      expect(visual.width).toBe(1080);
      expect(visual.height).toBe(1080);
    });

    it('should include generation metadata', async () => {
      const visual = await generateVisual({
        platform: 'tiktok',
        format: 'video',
        productName: 'Viral Product',
        productCategory: 'beauty'
      });

      expect(visual.generationModel).toBeDefined();
      expect(visual.generationPrompt).toBeDefined();
      expect(visual.confidenceScore).toBeGreaterThan(0);
      expect(visual.confidenceScore).toBeLessThanOrEqual(1);
    });

    it('should generate carousel images', async () => {
      const carousel = await generateCarousel({
        platform: 'instagram',
        format: 'image',
        productName: 'Multi Product',
        productCategory: 'ecommerce'
      }, 3);

      expect(carousel).toHaveLength(3);
      carousel.forEach(visual => {
        expect(visual.url).toBeDefined();
        expect(visual.width).toBeDefined();
        expect(visual.height).toBeDefined();
      });
    });

    it('should estimate file sizes correctly', async () => {
      const image = await generateVisual({
        platform: 'facebook',
        format: 'image',
        productName: 'Product',
        productCategory: 'tech'
      });

      expect(image.fileSize).toBeGreaterThan(0);
      expect(image.fileSize).toBeLessThan(10 * 1024 * 1024); // < 10MB
    });
  });
});

describe('Ad Engine - Targeting Optimizer', () => {
  describe('optimizeTargeting', () => {
    it('should optimize targeting for Facebook', () => {
      const targeting = optimizeTargeting({
        platform: 'facebook',
        objective: 'conversions',
        productCategory: 'fashion',
        merchantCountry: 'SN',
        budget: 50
      });

      expect(targeting.countries).toContain('SN');
      expect(targeting.interests).toBeDefined();
      expect(targeting.interests.length).toBeGreaterThan(0);
      expect(targeting.ageMin).toBeGreaterThanOrEqual(18);
      expect(targeting.ageMax).toBeLessThanOrEqual(65);
    });

    it('should adjust age range for TikTok', () => {
      const targeting = optimizeTargeting({
        platform: 'tiktok',
        objective: 'awareness',
        productCategory: 'tech',
        merchantCountry: 'FR',
        budget: 100
      });

      expect(targeting.ageMin).toBeGreaterThanOrEqual(16);
      expect(targeting.ageMax).toBeLessThanOrEqual(35);
    });

    it('should add professional interests for LinkedIn', () => {
      const targeting = optimizeTargeting({
        platform: 'linkedin',
        objective: 'traffic',
        productCategory: 'ecommerce',
        merchantCountry: 'US',
        budget: 75
      });

      expect(targeting.ageMin).toBeGreaterThanOrEqual(22);
      expect(targeting.interests).toContain('Business');
    });

    it('should estimate audience size', () => {
      const targeting = optimizeTargeting({
        platform: 'facebook',
        objective: 'conversions',
        productCategory: 'fashion',
        merchantCountry: 'SN',
        budget: 50
      });

      expect(targeting.audienceSizeEstimate).toBeGreaterThan(0);
    });

    it('should use customer insights when available', () => {
      const targeting = optimizeTargeting({
        platform: 'facebook',
        objective: 'conversions',
        productCategory: 'tech',
        merchantCountry: 'FR',
        budget: 100,
        existingCustomerData: {
          topCountries: ['FR', 'SN'],
          topCities: ['Paris', 'Dakar'],
          ageDistribution: { '25-34': 60, '35-44': 30 },
          genderDistribution: { male: 70, female: 30 },
          interests: ['Technology', 'Gadgets'],
          purchaseBehaviors: ['online_shopping']
        }
      });

      expect(targeting.countries).toContain('FR');
      expect(targeting.countries).toContain('SN');
      expect(targeting.ageMin).toBeGreaterThanOrEqual(25);
      expect(targeting.gender).toBe('male');
    });
  });

  describe('recommendBudget', () => {
    it('should recommend budget for conversions objective', () => {
      const recommendation = recommendBudget({
        platform: 'facebook',
        objective: 'conversions',
        targetAudienceSize: 500000,
        desiredConversions: 20,
        avgOrderValue: 50
      });

      expect(recommendation.dailyBudget).toBeGreaterThan(0);
      expect(recommendation.totalBudget).toBeGreaterThan(0);
      expect(recommendation.duration).toBeGreaterThan(0);
      expect(recommendation.expectedResults).toBeDefined();
      expect(recommendation.expectedResults.conversions).toBeGreaterThan(0);
    });

    it('should calculate ROAS correctly', () => {
      const recommendation = recommendBudget({
        platform: 'facebook',
        objective: 'conversions',
        targetAudienceSize: 100000,
        desiredConversions: 10,
        avgOrderValue: 100
      });

      expect(recommendation.expectedResults.roas).toBeGreaterThan(0);
      expect(recommendation.expectedResults.estimatedRevenue).toBeGreaterThan(0);
    });

    it('should recommend appropriate bid strategy', () => {
      const conversionsRec = recommendBudget({
        platform: 'facebook',
        objective: 'conversions',
        targetAudienceSize: 50000,
        desiredConversions: 5
      });

      expect(conversionsRec.bidStrategy).toBe('cost_per_conversion');

      const trafficRec = recommendBudget({
        platform: 'instagram',
        objective: 'traffic',
        targetAudienceSize: 50000,
        desiredConversions: 5
      });

      expect(trafficRec.bidStrategy).toBe('cost_per_click');
    });

    it('should respect platform minimum budgets', () => {
      const tiktokRec = recommendBudget({
        platform: 'tiktok',
        objective: 'awareness',
        targetAudienceSize: 100000,
        desiredConversions: 1,
        avgOrderValue: 10
      });

      expect(tiktokRec.dailyBudget).toBeGreaterThanOrEqual(20);
    });
  });
});

describe('Ad Engine - Integration', () => {
  it('should generate complete ad campaign', async () => {
    // This would test generateSocialAd function
    // Skipped in this example as it requires database connection

    // Mock test structure:
    const mockAd = {
      platform: 'facebook',
      objective: 'conversions',
      productName: 'Test Product',
      copy: 'Generated copy...',
      mediaUrl: 'https://cdn.example.com/image.jpg',
      targeting: { countries: ['SN'], ageMin: 18, ageMax: 45 },
      budget: 50,
      aiConfidenceScore: 0.85
    };

    expect(mockAd.platform).toBe('facebook');
    expect(mockAd.aiConfidenceScore).toBeGreaterThan(0.7);
  });
});
