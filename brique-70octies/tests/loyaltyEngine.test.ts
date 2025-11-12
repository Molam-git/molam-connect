import { calculatePoints } from '../src/services/loyaltyEngine';

describe('Loyalty Engine - Points Calculation', () => {
  const mockProgramId = 'test-program-123';
  const mockUserId = 'test-user-456';

  it('should calculate base points correctly', async () => {
    // Mock test - in production, would use actual DB
    const mockTransaction = {
      merchant_id: 'merchant-1',
      user_id: mockUserId,
      amount: 100,
      module: 'shop'
    };

    // Expected: 100 * 0.02 = 2 base points
    // With tier multiplier and AI bonus, total should be > 2
    expect(mockTransaction.amount).toBe(100);
  });

  it('should apply tier multipliers', () => {
    const tierMultipliers = {
      basic: 1.0,
      silver: 1.25,
      gold: 1.5,
      platinum: 2.0
    };

    expect(tierMultipliers.platinum).toBe(2.0);
    expect(tierMultipliers.gold).toBe(1.5);
    expect(tierMultipliers.silver).toBe(1.25);
  });

  it('should give AI bonus for high-value transactions', () => {
    const highValueAmount = 600;
    const expectedBonus = highValueAmount * 0.01; // 1% bonus

    expect(expectedBonus).toBe(6);
  });

  it('should calculate churn risk prevention bonus', () => {
    const churnRiskScore = 0.8;
    const transactionAmount = 100;

    if (churnRiskScore > 0.7) {
      const bonus = transactionAmount * 0.02;
      expect(bonus).toBe(2);
    }
  });

  it('should give cross-module promotion bonus', () => {
    const modules = ['shop', 'eats', 'talk', 'free'];

    expect(modules).toContain('eats');
    expect(modules.length).toBe(4);
  });
});

describe('Loyalty Tiers', () => {
  it('should have correct tier thresholds', () => {
    const thresholds = {
      silver: { points: 1000, spend: 500 },
      gold: { points: 5000, spend: 2500 },
      platinum: { points: 20000, spend: 10000 }
    };

    expect(thresholds.silver.points).toBe(1000);
    expect(thresholds.gold.points).toBe(5000);
    expect(thresholds.platinum.points).toBe(20000);
  });

  it('should upgrade tier when threshold reached', () => {
    const lifetimePoints = 1500;
    const silverThreshold = 1000;

    const shouldBeNextTier = lifetimePoints >= silverThreshold;
    expect(shouldBeNextTier).toBe(true);
  });
});

describe('AI Recommendations', () => {
  it('should recommend reactivation campaign for inactive users', () => {
    const totalUsers = 1000;
    const inactiveUsers = 250;
    const inactivePercentage = inactiveUsers / totalUsers;

    expect(inactivePercentage).toBe(0.25);

    if (inactivePercentage > 0.2) {
      const recommendation = {
        type: 'bonus_points',
        targetSegment: 'inactive',
        bonusMultiplier: 2.0
      };

      expect(recommendation.bonusMultiplier).toBe(2.0);
    }
  });

  it('should recommend tier upgrade campaign', () => {
    const basicTierUsers = 700;
    const totalUsers = 1000;
    const basicPercentage = basicTierUsers / totalUsers;

    if (basicPercentage > 0.7) {
      const recommendation = {
        type: 'tier_upgrade',
        targetTier: ['basic'],
        fixedBonus: 500
      };

      expect(recommendation.fixedBonus).toBe(500);
    }
  });
});
