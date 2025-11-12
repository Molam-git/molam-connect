/**
 * Brique 70sexies - AI Social Ads Generator
 * Audience Targeting & Budget Optimization Service
 */

export interface TargetingParams {
  platform: string;
  objective: string;
  productCategory: string;
  merchantCountry: string;
  budget: number;
  existingCustomerData?: CustomerInsights;
}

export interface CustomerInsights {
  topCountries: string[];
  topCities: string[];
  ageDistribution: Record<string, number>;
  genderDistribution: Record<string, number>;
  interests: string[];
  purchaseBehaviors: string[];
}

export interface OptimizedTargeting {
  countries: string[];
  cities?: string[];
  ageMin: number;
  ageMax: number;
  gender?: 'male' | 'female' | 'all';
  interests: string[];
  behaviors?: string[];
  customAudiences?: string[];
  lookalike?: boolean;
  audienceSizeEstimate: number;
}

export interface BudgetRecommendation {
  dailyBudget: number;
  totalBudget: number;
  duration: number; // days
  expectedResults: {
    impressions: number;
    clicks: number;
    conversions: number;
    estimatedRevenue: number;
    roas: number;
  };
  bidStrategy: string;
}

/**
 * Platform-specific audience insights and benchmarks
 */
const PLATFORM_BENCHMARKS = {
  facebook: {
    avgCPM: 12.50, // Cost per 1000 impressions
    avgCPC: 1.20, // Cost per click
    avgCTR: 1.5, // Click-through rate %
    avgConversionRate: 2.5, // %
    minBudget: 5,
    recommendedBudget: 50
  },
  instagram: {
    avgCPM: 8.50,
    avgCPC: 0.90,
    avgCTR: 1.8,
    avgConversionRate: 2.0,
    minBudget: 5,
    recommendedBudget: 50
  },
  tiktok: {
    avgCPM: 10.00,
    avgCPC: 0.50,
    avgCTR: 2.5,
    avgConversionRate: 1.5,
    minBudget: 20,
    recommendedBudget: 100
  },
  linkedin: {
    avgCPM: 30.00,
    avgCPC: 5.50,
    avgCTR: 0.8,
    avgConversionRate: 3.5,
    minBudget: 10,
    recommendedBudget: 75
  },
  twitter: {
    avgCPM: 6.50,
    avgCPC: 0.75,
    avgCTR: 1.2,
    avgConversionRate: 1.8,
    minBudget: 5,
    recommendedBudget: 40
  }
};

/**
 * Category-specific interest targeting
 */
const CATEGORY_INTERESTS: Record<string, string[]> = {
  fashion: [
    'Fashion & Beauty',
    'Shopping',
    'Online Shopping',
    'Clothing',
    'Fashion Design',
    'Accessories',
    'Style',
    'Trends'
  ],
  tech: [
    'Technology',
    'Gadgets',
    'Electronics',
    'Innovation',
    'Software',
    'Mobile Apps',
    'Startups'
  ],
  beauty: [
    'Beauty',
    'Cosmetics',
    'Skincare',
    'Makeup',
    'Personal Care',
    'Wellness',
    'Self-care'
  ],
  food: [
    'Food & Dining',
    'Restaurants',
    'Cooking',
    'Gourmet',
    'Healthy Eating',
    'Delivery',
    'Cuisine'
  ],
  fitness: [
    'Fitness',
    'Health & Wellness',
    'Exercise',
    'Gym',
    'Sports',
    'Yoga',
    'Running',
    'Nutrition'
  ],
  travel: [
    'Travel',
    'Tourism',
    'Adventure',
    'Hotels',
    'Flights',
    'Vacation',
    'Exploration'
  ],
  ecommerce: [
    'Online Shopping',
    'E-commerce',
    'Deals',
    'Shopping',
    'Retail'
  ]
};

/**
 * Optimize audience targeting based on data
 */
export function optimizeTargeting(params: TargetingParams): OptimizedTargeting {
  const {
    platform,
    objective,
    productCategory,
    merchantCountry,
    budget,
    existingCustomerData
  } = params;

  // Base targeting
  let targeting: OptimizedTargeting = {
    countries: [merchantCountry],
    ageMin: 18,
    ageMax: 65,
    gender: 'all',
    interests: CATEGORY_INTERESTS[productCategory] || CATEGORY_INTERESTS.ecommerce,
    audienceSizeEstimate: 500000
  };

  // Use existing customer insights if available
  if (existingCustomerData) {
    targeting = refineTargetingFromInsights(targeting, existingCustomerData, platform);
  }

  // Platform-specific optimizations
  targeting = applyPlatformOptimizations(targeting, platform, objective);

  // Budget-based audience sizing
  targeting = adjustAudienceSizeForBudget(targeting, budget, platform);

  return targeting;
}

/**
 * Refine targeting using customer insights
 */
function refineTargetingFromInsights(
  baseTargeting: OptimizedTargeting,
  insights: CustomerInsights,
  platform: string
): OptimizedTargeting {
  const refined = { ...baseTargeting };

  // Use top performing countries
  if (insights.topCountries.length > 0) {
    refined.countries = insights.topCountries.slice(0, 3);
  }

  // Use top performing cities (if data available)
  if (insights.topCities && insights.topCities.length > 0) {
    refined.cities = insights.topCities.slice(0, 5);
  }

  // Optimize age range from distribution
  if (insights.ageDistribution) {
    const ages = Object.entries(insights.ageDistribution)
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .slice(0, 3); // Top 3 age groups

    if (ages.length > 0) {
      const ageRanges = ages.map(([range]) => range);
      refined.ageMin = Math.min(...ageRanges.map(r => parseInt(r.split('-')[0])));
      refined.ageMax = Math.max(...ageRanges.map(r => parseInt(r.split('-')[1] || r.split('-')[0])));
    }
  }

  // Optimize gender targeting
  if (insights.genderDistribution) {
    const malePercent = insights.genderDistribution.male || 0;
    const femalePercent = insights.genderDistribution.female || 0;

    if (malePercent > 70) refined.gender = 'male';
    else if (femalePercent > 70) refined.gender = 'female';
    else refined.gender = 'all';
  }

  // Add customer interests
  if (insights.interests && insights.interests.length > 0) {
    refined.interests = [...new Set([...refined.interests, ...insights.interests])].slice(0, 10);
  }

  // Add purchase behaviors
  if (insights.purchaseBehaviors && insights.purchaseBehaviors.length > 0) {
    refined.behaviors = insights.purchaseBehaviors;
    refined.lookalike = true; // Enable lookalike audiences
  }

  return refined;
}

/**
 * Apply platform-specific targeting optimizations
 */
function applyPlatformOptimizations(
  targeting: OptimizedTargeting,
  platform: string,
  objective: string
): OptimizedTargeting {
  const optimized = { ...targeting };

  // TikTok: Younger audience
  if (platform === 'tiktok') {
    optimized.ageMin = Math.max(16, targeting.ageMin);
    optimized.ageMax = Math.min(35, targeting.ageMax);
  }

  // LinkedIn: Professional audience
  if (platform === 'linkedin') {
    optimized.ageMin = Math.max(22, targeting.ageMin);
    optimized.ageMax = Math.min(60, targeting.ageMax);
    // Add professional interests
    optimized.interests = [
      ...optimized.interests,
      'Business',
      'Professional Development',
      'Entrepreneurship'
    ].slice(0, 10);
  }

  // Facebook: Broad reach
  if (platform === 'facebook') {
    // Facebook performs well with broader targeting for awareness
    if (objective === 'awareness') {
      optimized.ageMin = 18;
      optimized.ageMax = 55;
    }
  }

  // Instagram: Visual products
  if (platform === 'instagram') {
    // Instagram favors tighter, more specific targeting
    optimized.interests = optimized.interests.slice(0, 5);
  }

  return optimized;
}

/**
 * Adjust audience size based on budget
 */
function adjustAudienceSizeForBudget(
  targeting: OptimizedTargeting,
  budget: number,
  platform: string
): OptimizedTargeting {
  const benchmarks = PLATFORM_BENCHMARKS[platform as keyof typeof PLATFORM_BENCHMARKS] || PLATFORM_BENCHMARKS.facebook;

  // Calculate reach based on budget
  const estimatedImpressions = (budget / benchmarks.avgCPM) * 1000;
  const estimatedReach = estimatedImpressions * 0.6; // Frequency factor

  // Audience should be 10x reach for good performance
  const optimalAudienceSize = estimatedReach * 10;

  return {
    ...targeting,
    audienceSizeEstimate: Math.floor(optimalAudienceSize)
  };
}

/**
 * Generate budget recommendation
 */
export function recommendBudget(params: {
  platform: string;
  objective: string;
  targetAudienceSize: number;
  desiredConversions: number;
  avgOrderValue?: number;
}): BudgetRecommendation {
  const {
    platform,
    objective,
    targetAudienceSize,
    desiredConversions,
    avgOrderValue = 50
  } = params;

  const benchmarks = PLATFORM_BENCHMARKS[platform as keyof typeof PLATFORM_BENCHMARKS] || PLATFORM_BENCHMARKS.facebook;

  // Calculate required clicks for desired conversions
  const requiredClicks = Math.ceil(desiredConversions / (benchmarks.avgConversionRate / 100));

  // Calculate required impressions for desired clicks
  const requiredImpressions = Math.ceil(requiredClicks / (benchmarks.avgCTR / 100));

  // Calculate budget
  const totalBudget = (requiredImpressions / 1000) * benchmarks.avgCPM;
  const duration = Math.max(7, Math.ceil(totalBudget / benchmarks.recommendedBudget));
  const dailyBudget = Math.ceil(totalBudget / duration);

  // Expected results
  const expectedImpressions = (dailyBudget * duration / benchmarks.avgCPM) * 1000;
  const expectedClicks = Math.floor(expectedImpressions * (benchmarks.avgCTR / 100));
  const expectedConversions = Math.floor(expectedClicks * (benchmarks.avgConversionRate / 100));
  const estimatedRevenue = expectedConversions * avgOrderValue;
  const roas = estimatedRevenue / totalBudget;

  // Bid strategy recommendation
  let bidStrategy = 'lowest_cost';
  if (objective === 'conversions') bidStrategy = 'cost_per_conversion';
  else if (objective === 'traffic') bidStrategy = 'cost_per_click';
  else if (objective === 'awareness') bidStrategy = 'cost_per_impression';

  return {
    dailyBudget: Math.max(dailyBudget, benchmarks.minBudget),
    totalBudget,
    duration,
    expectedResults: {
      impressions: Math.floor(expectedImpressions),
      clicks: expectedClicks,
      conversions: expectedConversions,
      estimatedRevenue: Math.floor(estimatedRevenue),
      roas: Math.round(roas * 100) / 100
    },
    bidStrategy
  };
}

/**
 * Estimate audience size
 */
export function estimateAudienceSize(targeting: OptimizedTargeting, platform: string): number {
  // Base size by country
  const countrySizes: Record<string, number> = {
    SN: 3000000, // Senegal active users
    FR: 40000000, // France
    CI: 5000000, // Côte d'Ivoire
    US: 200000000, // United States
    NG: 25000000, // Nigeria
    GB: 45000000 // United Kingdom
  };

  let totalSize = 0;
  targeting.countries.forEach(country => {
    totalSize += countrySizes[country] || 1000000;
  });

  // Apply filters
  const ageRange = targeting.ageMax - targeting.ageMin;
  const ageFactor = ageRange / 47; // 18-65 is full range

  const genderFactor = targeting.gender === 'all' ? 1.0 : 0.5;

  const interestFactor = Math.max(0.1, 1 - (targeting.interests.length * 0.05));

  return Math.floor(totalSize * ageFactor * genderFactor * interestFactor);
}

/**
 * Score targeting quality
 */
export function scoreTargetingQuality(targeting: OptimizedTargeting, budget: number): number {
  let score = 50; // Base score

  // Audience size vs budget balance
  const audienceTobudgetRatio = targeting.audienceSizeEstimate / budget;
  if (audienceTobudgetRatio > 5000 && audienceTobudgetRatio < 50000) score += 20;
  else if (audienceTobudgetRatio < 1000 || audienceTobudgetRatio > 100000) score -= 10;

  // Interest specificity
  if (targeting.interests.length >= 3 && targeting.interests.length <= 7) score += 15;
  if (targeting.interests.length > 10) score -= 10;

  // Age range specificity
  const ageRange = targeting.ageMax - targeting.ageMin;
  if (ageRange >= 15 && ageRange <= 25) score += 10;
  if (ageRange > 40) score -= 5;

  // Gender specificity bonus
  if (targeting.gender !== 'all') score += 5;

  // Geographic focus
  if (targeting.countries.length <= 3) score += 10;

  // Advanced features
  if (targeting.lookalike) score += 10;
  if (targeting.customAudiences && targeting.customAudiences.length > 0) score += 10;

  return Math.min(Math.max(score, 0), 100);
}
