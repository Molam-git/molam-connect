/**
 * Brique 70quinquies - AI Campaign Generator
 * Content Generator Tests
 */

import {
  generateContent,
  generateSubjectVariants,
  getOptimalSendTime,
  generateSMSContent
} from '../src/services/contentGenerator';

describe('Content Generator', () => {
  describe('generateContent', () => {
    it('should generate abandoned cart content in French', () => {
      const content = generateContent('abandoned_cart', 'fr', {
        customerName: 'Jean',
        discountValue: 15,
        productName: 'iPhone 13',
        promoCode: 'CART15'
      });

      expect(content.subject).toContain('Jean');
      expect(content.body).toContain('15');
      expect(content.body).toContain('CART15');
      expect(content.cta).toBeDefined();
      expect(content.slogan).toBeDefined();
    });

    it('should generate welcome content in English', () => {
      const content = generateContent('welcome', 'en', {
        customerName: 'John',
        merchantName: 'MoLam Store',
        discountValue: 20,
        promoCode: 'WELCOME20',
        expiryDate: '2024-12-31'
      });

      expect(content.subject).toContain('Welcome');
      expect(content.subject).toContain('John');
      expect(content.body).toContain('20');
      expect(content.body).toContain('WELCOME20');
    });

    it('should generate reactivation content in Wolof', () => {
      const content = generateContent('reactivation', 'wo', {
        customerName: 'Fatou',
        discountValue: 25,
        promoCode: 'COMEBACK25'
      });

      expect(content.subject).toBeDefined();
      expect(content.body).toContain('25');
      expect(content.cta).toBeDefined();
    });

    it('should generate VIP content in Arabic', () => {
      const content = generateContent('vip_exclusive', 'ar', {
        customerName: 'محمد',
        discountValue: 30,
        promoCode: 'VIP30',
        expiryDate: '2024-12-31'
      });

      expect(content.subject).toBeDefined();
      expect(content.body).toContain('30');
      expect(content.body).toContain('VIP30');
    });

    it('should generate seasonal content in Portuguese', () => {
      const content = generateContent('seasonal', 'pt', {
        customerName: 'Maria',
        merchantName: 'MoLam Store',
        discountValue: 40,
        promoCode: 'SUMMER40',
        expiryDate: '2024-08-31'
      });

      expect(content.subject).toBeDefined();
      expect(content.body).toContain('40');
      expect(content.cta).toBeDefined();
    });

    it('should replace all variables in template', () => {
      const content = generateContent('welcome', 'fr', {
        customerName: 'Pierre',
        merchantName: 'MoLam Store',
        discountValue: 15,
        promoCode: 'WELCOME15',
        expiryDate: '2024-12-31'
      });

      expect(content.subject).not.toContain('{{');
      expect(content.body).not.toContain('{{');
    });

    it('should fallback to French if language not supported', () => {
      const content = generateContent('welcome', 'es', {
        customerName: 'Carlos',
        discountValue: 15
      });

      expect(content).toBeDefined();
      expect(content.subject).toBeDefined();
    });

    it('should throw error for unknown campaign type', () => {
      expect(() => {
        generateContent('unknown_type', 'fr', {});
      }).toThrow('Unknown campaign type');
    });

    it('should handle missing variables gracefully', () => {
      const content = generateContent('welcome', 'fr', {});

      expect(content.subject).toBeDefined();
      expect(content.body).toBeDefined();
      // Variables should remain as placeholders
      expect(content.subject).toContain('{{');
    });
  });

  describe('generateSubjectVariants', () => {
    it('should generate subject variants in French', () => {
      const variants = generateSubjectVariants(
        'Votre panier vous attend !',
        'fr'
      );

      expect(variants).toHaveLength(4);
      expect(variants[0]).toBe('Votre panier vous attend !');
      expect(variants[1]).toContain('🎁');
      expect(variants[2]).toContain('⏰');
      expect(variants[2]).toContain('Offre limitée');
    });

    it('should generate subject variants in English', () => {
      const variants = generateSubjectVariants(
        'Your cart is waiting!',
        'en'
      );

      expect(variants).toHaveLength(4);
      expect(variants[2]).toContain('Limited offer');
    });

    it('should generate subject variants in Wolof', () => {
      const variants = generateSubjectVariants(
        'Sa panier dalay gis!',
        'wo'
      );

      expect(variants).toHaveLength(4);
      expect(variants[1]).toContain('🎁');
    });

    it('should generate subject variants in Arabic', () => {
      const variants = generateSubjectVariants(
        'سلة التسوق في انتظارك!',
        'ar'
      );

      expect(variants).toHaveLength(4);
      expect(variants[2]).toContain('عرض محدود');
    });

    it('should generate subject variants in Portuguese', () => {
      const variants = generateSubjectVariants(
        'Seu carrinho está esperando!',
        'pt'
      );

      expect(variants).toHaveLength(4);
      expect(variants[2]).toContain('Oferta limitada');
    });

    it('should default to French variants if language not supported', () => {
      const variants = generateSubjectVariants(
        'Test subject',
        'unknown'
      );

      expect(variants).toHaveLength(4);
      expect(variants[2]).toContain('Offre limitée');
    });
  });

  describe('getOptimalSendTime', () => {
    it('should schedule B2B campaigns for morning (10am)', () => {
      const sendTime = getOptimalSendTime('UTC', 'b2b');
      const hour = sendTime.getHours();

      expect(hour).toBe(10);
      expect(sendTime.getMinutes()).toBe(0);
      expect(sendTime.getSeconds()).toBe(0);
    });

    it('should schedule B2C campaigns for evening (6pm)', () => {
      const sendTime = getOptimalSendTime('UTC', 'b2c');
      const hour = sendTime.getHours();

      expect(hour).toBe(18);
      expect(sendTime.getMinutes()).toBe(0);
      expect(sendTime.getSeconds()).toBe(0);
    });

    it('should schedule for future if time has passed today', () => {
      const sendTime = getOptimalSendTime('UTC', 'b2c');
      const now = new Date();

      expect(sendTime.getTime()).toBeGreaterThanOrEqual(now.getTime());
    });

    it('should handle different timezones', () => {
      const sendTimeUTC = getOptimalSendTime('UTC', 'b2c');
      const sendTimeDakar = getOptimalSendTime('Africa/Dakar', 'b2c');

      expect(sendTimeUTC).toBeDefined();
      expect(sendTimeDakar).toBeDefined();
    });

    it('should default to B2C time if audience type not specified', () => {
      const sendTime = getOptimalSendTime('UTC', 'unknown');
      const hour = sendTime.getHours();

      expect(hour).toBe(18);
    });
  });

  describe('generateSMSContent', () => {
    it('should generate short SMS content for abandoned cart', () => {
      const sms = generateSMSContent('abandoned_cart', 'fr', {
        merchantName: 'MoLam',
        discountValue: 15,
        promoCode: 'CART15'
      });

      expect(sms.length).toBeLessThan(160);
      expect(sms).toContain('MoLam');
      expect(sms).toContain('15');
      expect(sms).toContain('CART15');
    });

    it('should generate SMS for flash sale in English', () => {
      const sms = generateSMSContent('flash_sale', 'en', {
        merchantName: 'MoLam',
        discountValue: 30,
        promoCode: 'FLASH30'
      });

      expect(sms.length).toBeLessThan(160);
      expect(sms).toContain('FLASH');
      expect(sms).toContain('30');
    });

    it('should generate SMS in Wolof', () => {
      const sms = generateSMSContent('abandoned_cart', 'wo', {
        merchantName: 'MoLam',
        discountValue: 20,
        promoCode: 'TEST20'
      });

      expect(sms).toBeDefined();
      expect(sms.length).toBeLessThan(160);
    });

    it('should generate SMS in Arabic', () => {
      const sms = generateSMSContent('flash_sale', 'ar', {
        merchantName: 'MoLam',
        discountValue: 25,
        promoCode: 'FLASH25'
      });

      expect(sms).toBeDefined();
      expect(sms).toContain('25');
    });

    it('should generate SMS in Portuguese', () => {
      const sms = generateSMSContent('abandoned_cart', 'pt', {
        merchantName: 'MoLam',
        discountValue: 15,
        promoCode: 'CART15'
      });

      expect(sms).toBeDefined();
      expect(sms.length).toBeLessThan(160);
    });

    it('should replace variables in SMS template', () => {
      const sms = generateSMSContent('flash_sale', 'fr', {
        merchantName: 'MoLam Store',
        discountValue: 40,
        promoCode: 'MEGA40'
      });

      expect(sms).toContain('MoLam Store');
      expect(sms).toContain('40');
      expect(sms).toContain('MEGA40');
      expect(sms).not.toContain('{{');
    });

    it('should return empty string for unknown campaign type', () => {
      const sms = generateSMSContent('unknown_type', 'fr', {});

      expect(sms).toBe('');
    });

    it('should fallback to French if language not supported', () => {
      const sms = generateSMSContent('flash_sale', 'unknown', {
        merchantName: 'MoLam',
        discountValue: 30,
        promoCode: 'FLASH30'
      });

      expect(sms).toBeDefined();
    });
  });

  describe('Content Personalization', () => {
    it('should personalize content with customer name', () => {
      const content = generateContent('welcome', 'fr', {
        customerName: 'Sophie',
        merchantName: 'MoLam',
        discountValue: 20,
        promoCode: 'WELCOME20'
      });

      expect(content.subject).toContain('Sophie');
      expect(content.body).toContain('Sophie');
    });

    it('should personalize content with product name', () => {
      const content = generateContent('abandoned_cart', 'fr', {
        customerName: 'Marc',
        productName: 'MacBook Pro',
        discountValue: 10,
        promoCode: 'RETURN10'
      });

      expect(content.body).toContain('MacBook Pro');
    });

    it('should personalize content with merchant name', () => {
      const content = generateContent('welcome', 'en', {
        customerName: 'Alice',
        merchantName: 'Fashion Store',
        discountValue: 15,
        promoCode: 'NEW15'
      });

      expect(content.subject).toContain('Fashion Store');
    });

    it('should personalize content with expiry date', () => {
      const content = generateContent('vip_exclusive', 'fr', {
        customerName: 'Laurent',
        discountValue: 30,
        promoCode: 'VIP30',
        expiryDate: '31 Décembre 2024'
      });

      expect(content.body).toContain('31 Décembre 2024');
    });
  });

  describe('Campaign Type Coverage', () => {
    const campaignTypes = [
      'abandoned_cart',
      'welcome',
      'reactivation',
      'vip_exclusive',
      'seasonal'
    ];

    campaignTypes.forEach(type => {
      it(`should have template for ${type}`, () => {
        const content = generateContent(type, 'fr', {
          customerName: 'Test',
          discountValue: 15,
          promoCode: 'TEST15'
        });

        expect(content.subject).toBeDefined();
        expect(content.body).toBeDefined();
        expect(content.cta).toBeDefined();
      });
    });
  });

  describe('Language Coverage', () => {
    const languages = ['fr', 'en', 'wo', 'ar', 'pt'];

    languages.forEach(lang => {
      it(`should support ${lang} language`, () => {
        const content = generateContent('welcome', lang, {
          customerName: 'Test',
          merchantName: 'Store',
          discountValue: 20,
          promoCode: 'TEST20'
        });

        expect(content.subject).toBeDefined();
        expect(content.body).toBeDefined();
      });
    });
  });
});
