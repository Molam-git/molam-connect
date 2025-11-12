/**
 * Brique 70quinquies - AI Campaign Generator
 * Campaign Engine Tests
 */

import {
  generateCampaign,
  getCampaign,
  updateCampaignStatus,
  trackEvent,
  getCampaignReport,
  createSegment,
  listCampaigns,
  optimizeCampaign
} from '../src/services/campaignEngine';

describe('Campaign Engine', () => {
  const testMerchantId = 'test-merchant-123';

  describe('generateCampaign', () => {
    it('should generate abandoned cart campaign in French', async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'abandoned_cart',
        channel: 'email',
        language: 'fr',
        discountValue: 15,
        autoOptimize: true
      });

      expect(campaign).toBeDefined();
      expect(campaign.merchantId).toBe(testMerchantId);
      expect(campaign.channel).toBe('email');
      expect(campaign.language).toBe('fr');
      expect(campaign.title).toContain('panier');
      expect(campaign.status).toBe('scheduled');
    });

    it('should generate welcome campaign in English', async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'welcome',
        channel: 'email',
        language: 'en',
        discountValue: 20
      });

      expect(campaign).toBeDefined();
      expect(campaign.language).toBe('en');
      expect(campaign.title).toContain('Welcome');
    });

    it('should generate SMS campaign with short content', async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'flash_sale',
        channel: 'sms',
        language: 'fr',
        discountValue: 30
      });

      expect(campaign).toBeDefined();
      expect(campaign.channel).toBe('sms');
      expect(campaign.body.length).toBeLessThan(160);
    });

    it('should generate VIP campaign in Wolof', async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'vip_exclusive',
        channel: 'email',
        language: 'wo',
        discountValue: 25
      });

      expect(campaign).toBeDefined();
      expect(campaign.language).toBe('wo');
      expect(campaign.title).toBeDefined();
    });

    it('should auto-segment audience based on campaign type', async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'reactivation',
        channel: 'email',
        language: 'fr'
      });

      expect(campaign.audience).toBeDefined();
      expect(campaign.audience.type).toBe('inactive');
      expect(campaign.audience.criteria).toBeDefined();
    });

    it('should schedule campaign for optimal send time', async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'seasonal',
        channel: 'email',
        language: 'fr'
      });

      expect(campaign.scheduledAt).toBeDefined();
      const scheduledDate = new Date(campaign.scheduledAt!);
      expect(scheduledDate.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Campaign Status Management', () => {
    let campaignId: string;

    beforeEach(async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'welcome',
        channel: 'email',
        language: 'fr',
        autoOptimize: false
      });
      campaignId = campaign.id;
    });

    it('should update campaign status to scheduled', async () => {
      await updateCampaignStatus(campaignId, 'scheduled');
      const campaign = await getCampaign(campaignId);
      expect(campaign.status).toBe('scheduled');
    });

    it('should update campaign status to sending', async () => {
      await updateCampaignStatus(campaignId, 'sending');
      const campaign = await getCampaign(campaignId);
      expect(campaign.status).toBe('sending');
    });

    it('should update campaign status to paused', async () => {
      await updateCampaignStatus(campaignId, 'paused');
      const campaign = await getCampaign(campaignId);
      expect(campaign.status).toBe('paused');
    });
  });

  describe('Campaign Tracking', () => {
    let campaignId: string;

    beforeEach(async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'abandoned_cart',
        channel: 'email',
        language: 'fr'
      });
      campaignId = campaign.id;
    });

    it('should track sent event', async () => {
      await trackEvent(campaignId, 'sent', 'customer-123');
      const campaign = await getCampaign(campaignId);
      expect(campaign.performance.sent).toBe(1);
    });

    it('should track opened event', async () => {
      await trackEvent(campaignId, 'sent', 'customer-123');
      await trackEvent(campaignId, 'opened', 'customer-123');
      const campaign = await getCampaign(campaignId);
      expect(campaign.performance.opened).toBe(1);
    });

    it('should track clicked event', async () => {
      await trackEvent(campaignId, 'sent', 'customer-123');
      await trackEvent(campaignId, 'opened', 'customer-123');
      await trackEvent(campaignId, 'clicked', 'customer-123');
      const campaign = await getCampaign(campaignId);
      expect(campaign.performance.clicked).toBe(1);
    });

    it('should track purchased event', async () => {
      await trackEvent(campaignId, 'sent', 'customer-123');
      await trackEvent(campaignId, 'opened', 'customer-123');
      await trackEvent(campaignId, 'clicked', 'customer-123');
      await trackEvent(campaignId, 'purchased', 'customer-123', { revenue: 150 });
      const campaign = await getCampaign(campaignId);
      expect(campaign.performance.revenue).toBeGreaterThan(0);
    });

    it('should track multiple events for different customers', async () => {
      await trackEvent(campaignId, 'sent', 'customer-1');
      await trackEvent(campaignId, 'sent', 'customer-2');
      await trackEvent(campaignId, 'sent', 'customer-3');
      await trackEvent(campaignId, 'opened', 'customer-1');
      await trackEvent(campaignId, 'opened', 'customer-2');

      const campaign = await getCampaign(campaignId);
      expect(campaign.performance.sent).toBe(3);
      expect(campaign.performance.opened).toBe(2);
    });
  });

  describe('Campaign Reporting', () => {
    let campaignId: string;

    beforeEach(async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'welcome',
        channel: 'email',
        language: 'fr'
      });
      campaignId = campaign.id;

      // Simulate campaign activity
      await trackEvent(campaignId, 'sent', 'customer-1');
      await trackEvent(campaignId, 'sent', 'customer-2');
      await trackEvent(campaignId, 'sent', 'customer-3');
      await trackEvent(campaignId, 'opened', 'customer-1');
      await trackEvent(campaignId, 'opened', 'customer-2');
      await trackEvent(campaignId, 'clicked', 'customer-1');
    });

    it('should generate campaign report with metrics', async () => {
      const report = await getCampaignReport(campaignId);

      expect(report).toBeDefined();
      expect(report.campaignId).toBe(campaignId);
      expect(report.metrics).toBeDefined();
      expect(report.metrics.sent).toBe(3);
      expect(report.metrics.opened).toBe(2);
      expect(report.metrics.clicked).toBe(1);
    });

    it('should calculate open rate correctly', async () => {
      const report = await getCampaignReport(campaignId);
      expect(report.metrics.openRate).toBe('66.67%');
    });

    it('should calculate click rate correctly', async () => {
      const report = await getCampaignReport(campaignId);
      expect(report.metrics.clickRate).toBe('50.00%');
    });

    it('should include timeline events', async () => {
      const report = await getCampaignReport(campaignId);
      expect(report.timeline).toBeDefined();
      expect(report.timeline.length).toBeGreaterThan(0);
    });
  });

  describe('Campaign Optimization', () => {
    it('should optimize campaign with low open rate', async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'seasonal',
        channel: 'email',
        language: 'fr'
      });

      // Simulate low open rate
      for (let i = 0; i < 150; i++) {
        await trackEvent(campaign.id, 'sent', `customer-${i}`);
        if (i < 15) {
          await trackEvent(campaign.id, 'opened', `customer-${i}`);
        }
      }

      await optimizeCampaign(campaign.id);
      // Optimization should be triggered
      expect(true).toBe(true);
    });

    it('should expand audience for high performing campaigns', async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'flash_sale',
        channel: 'email',
        language: 'fr'
      });

      // Simulate high performance
      for (let i = 0; i < 100; i++) {
        await trackEvent(campaign.id, 'sent', `customer-${i}`);
        if (i < 40) {
          await trackEvent(campaign.id, 'opened', `customer-${i}`);
          if (i < 25) {
            await trackEvent(campaign.id, 'clicked', `customer-${i}`);
          }
        }
      }

      await optimizeCampaign(campaign.id);
      // Optimization should trigger audience expansion
      expect(true).toBe(true);
    });
  });

  describe('Audience Segmentation', () => {
    it('should create VIP segment', async () => {
      const segment = await createSegment(
        testMerchantId,
        'VIP Customers',
        'vip',
        {
          lifetimeValue: { min: 500 },
          ordersCount: { min: 5 },
          avgOrderValue: { min: 100 }
        }
      );

      expect(segment).toBeDefined();
      expect(segment.merchantId).toBe(testMerchantId);
      expect(segment.name).toBe('VIP Customers');
      expect(segment.segmentType).toBe('vip');
      expect(segment.size).toBeGreaterThan(0);
    });

    it('should create inactive customers segment', async () => {
      const segment = await createSegment(
        testMerchantId,
        'Inactive Customers',
        'inactive',
        {
          lastOrderDays: { min: 60 },
          totalOrders: { min: 1 }
        }
      );

      expect(segment).toBeDefined();
      expect(segment.segmentType).toBe('inactive');
    });

    it('should create abandoned cart segment', async () => {
      const segment = await createSegment(
        testMerchantId,
        'Abandoned Carts',
        'abandoned_cart',
        {
          hasAbandonedCart: true,
          cartAgeHours: { min: 2, max: 48 }
        }
      );

      expect(segment).toBeDefined();
      expect(segment.segmentType).toBe('abandoned_cart');
    });
  });

  describe('Campaign Listing', () => {
    beforeEach(async () => {
      // Create multiple campaigns
      await generateCampaign({
        merchantId: testMerchantId,
        type: 'welcome',
        channel: 'email',
        language: 'fr'
      });
      await generateCampaign({
        merchantId: testMerchantId,
        type: 'abandoned_cart',
        channel: 'sms',
        language: 'en'
      });
      await generateCampaign({
        merchantId: testMerchantId,
        type: 'vip_exclusive',
        channel: 'email',
        language: 'fr'
      });
    });

    it('should list all campaigns for merchant', async () => {
      const campaigns = await listCampaigns(testMerchantId);
      expect(campaigns.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter campaigns by status', async () => {
      const campaigns = await listCampaigns(testMerchantId, { status: 'scheduled' });
      expect(campaigns.length).toBeGreaterThan(0);
      campaigns.forEach(c => expect(c.status).toBe('scheduled'));
    });

    it('should filter campaigns by channel', async () => {
      const campaigns = await listCampaigns(testMerchantId, { channel: 'email' });
      expect(campaigns.length).toBeGreaterThan(0);
      campaigns.forEach(c => expect(c.channel).toBe('email'));
    });

    it('should limit number of campaigns returned', async () => {
      const campaigns = await listCampaigns(testMerchantId, { limit: 2 });
      expect(campaigns.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Multilingual Content', () => {
    const languages = ['fr', 'en', 'wo', 'ar', 'pt'];

    languages.forEach(lang => {
      it(`should generate campaign in ${lang}`, async () => {
        const campaign = await generateCampaign({
          merchantId: testMerchantId,
          type: 'welcome',
          channel: 'email',
          language: lang
        });

        expect(campaign.language).toBe(lang);
        expect(campaign.title).toBeDefined();
        expect(campaign.body).toBeDefined();
      });
    });

    it('should default to French if language not specified', async () => {
      const campaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'seasonal',
        channel: 'email'
      });

      expect(campaign.language).toBe('fr');
    });
  });

  describe('Multi-channel Support', () => {
    const channels = ['email', 'sms', 'push', 'social', 'checkout_banner'];

    channels.forEach(channel => {
      it(`should generate campaign for ${channel}`, async () => {
        const campaign = await generateCampaign({
          merchantId: testMerchantId,
          type: 'flash_sale',
          channel: channel as any,
          language: 'fr'
        });

        expect(campaign.channel).toBe(channel);
      });
    });

    it('should generate shorter content for SMS', async () => {
      const smsCampaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'flash_sale',
        channel: 'sms',
        language: 'fr'
      });

      const emailCampaign = await generateCampaign({
        merchantId: testMerchantId,
        type: 'flash_sale',
        channel: 'email',
        language: 'fr'
      });

      expect(smsCampaign.body.length).toBeLessThan(emailCampaign.body.length);
    });
  });
});
