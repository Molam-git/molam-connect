/**
 * Brique 70sexies - AI Social Ads Generator
 * Platform-Specific Copywriting Service
 */

export interface CopywritingParams {
  platform: 'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'twitter';
  objective: string;
  productName?: string;
  productCategory?: string;
  discount?: number;
  targetAudience?: string;
  tone?: 'professional' | 'casual' | 'trendy' | 'urgent';
  language?: string;
}

export interface GeneratedCopy {
  title: string;
  body: string;
  cta: string;
  hashtags?: string[];
}

/**
 * Platform-specific character limits and best practices
 */
const PLATFORM_SPECS = {
  facebook: {
    titleMaxLength: 40,
    bodyMaxLength: 125,
    optimalHashtags: 2,
    ctaStyle: 'button'
  },
  instagram: {
    titleMaxLength: 30,
    bodyMaxLength: 2200,
    optimalHashtags: 5,
    ctaStyle: 'bio_link'
  },
  tiktok: {
    titleMaxLength: 100,
    bodyMaxLength: 150,
    optimalHashtags: 5,
    ctaStyle: 'swipe_up'
  },
  linkedin: {
    titleMaxLength: 70,
    bodyMaxLength: 150,
    optimalHashtags: 3,
    ctaStyle: 'button'
  },
  twitter: {
    titleMaxLength: 280,
    bodyMaxLength: 280,
    optimalHashtags: 2,
    ctaStyle: 'link'
  }
};

/**
 * Platform-optimized copy templates
 */
const COPY_TEMPLATES = {
  facebook: {
    ecommerce: {
      professional: {
        title: 'Découvrez {{productName}} - Qualité Premium',
        body: 'Nouveau chez nous : {{productName}}. {{discount}}% de réduction pour nos clients. Livraison rapide garantie.',
        cta: 'shop_now'
      },
      casual: {
        title: '{{productName}} est arrivé ! 🎉',
        body: 'On a le {{productName}} que tu cherchais ! -{{discount}}% maintenant. Fonce !',
        cta: 'shop_now'
      },
      urgent: {
        title: '⏰ DERNIÈRE CHANCE : {{productName}}',
        body: 'Plus que quelques heures ! {{productName}} à -{{discount}}%. Stock limité.',
        cta: 'shop_now'
      }
    },
    service: {
      professional: {
        title: '{{productName}} - Votre solution professionnelle',
        body: 'Optimisez votre activité avec {{productName}}. Essai gratuit 30 jours.',
        cta: 'learn_more'
      }
    }
  },
  instagram: {
    ecommerce: {
      trendy: {
        title: '✨ {{productName}} ✨',
        body: 'Le {{productName}} de tes rêves est enfin là ! 💫\n\n{{discount}}% OFF avec le code INSTA{{discount}} 🎁\n\nLivraison offerte dès 50€ 📦',
        cta: 'shop_now',
        hashtags: ['{{productCategory}}', 'shopping', 'moda', 'tendance', 'nouveauté']
      },
      casual: {
        title: '{{productName}} 💕',
        body: 'Coup de cœur garanti avec notre {{productName}} ! -{{discount}}% pour toi 🎉',
        cta: 'shop_now',
        hashtags: ['{{productCategory}}', 'shopping', 'promo']
      }
    }
  },
  tiktok: {
    ecommerce: {
      trendy: {
        title: '🔥 {{productName}} VIRAL 🔥',
        body: 'TikTok l\'adore ! {{productName}} -{{discount}}% 😱 Stock limité !',
        cta: 'shop_now',
        hashtags: ['viral', 'fyp', 'trending', '{{productCategory}}', 'promo']
      },
      urgent: {
        title: '⚡ FLASH SALE: {{productName}}',
        body: '2H SEULEMENT ! -{{discount}}% sur {{productName}} 🔥 Go go go !',
        cta: 'shop_now',
        hashtags: ['flashsale', 'promo', 'shopping', '{{productCategory}}']
      }
    }
  },
  linkedin: {
    service: {
      professional: {
        title: '{{productName}} | Solution B2B',
        body: 'Boostez votre productivité avec {{productName}}. ROI prouvé. Essai gratuit.',
        cta: 'learn_more',
        hashtags: ['B2B', 'Productivité', 'Innovation']
      }
    }
  },
  twitter: {
    ecommerce: {
      casual: {
        title: '🚀 {{productName}} disponible ! -{{discount}}% avec TWITTER{{discount}}',
        body: '',
        cta: 'shop_now',
        hashtags: ['{{productCategory}}', 'promo']
      }
    }
  }
};

/**
 * Call-to-action buttons per platform
 */
const CTA_BUTTONS: Record<string, Record<string, string>> = {
  facebook: {
    shop_now: 'Acheter maintenant',
    learn_more: 'En savoir plus',
    sign_up: 'S\'inscrire',
    download: 'Télécharger',
    contact_us: 'Nous contacter',
    get_offer: 'Profiter de l\'offre'
  },
  instagram: {
    shop_now: 'Acheter',
    learn_more: 'Plus d\'infos',
    sign_up: 'Inscription',
    visit_profile: 'Voir le profil'
  },
  tiktok: {
    shop_now: 'Acheter maintenant',
    learn_more: 'Découvrir',
    download: 'Télécharger',
    visit_website: 'Visiter'
  },
  linkedin: {
    learn_more: 'En savoir plus',
    sign_up: 'S\'inscrire',
    contact_us: 'Contactez-nous',
    apply_now: 'Postuler',
    register: 'S\'enregistrer'
  },
  twitter: {
    shop_now: 'Acheter',
    learn_more: 'Découvrir',
    sign_up: 'S\'inscrire'
  }
};

/**
 * Generate platform-optimized ad copy
 */
export function generateCopy(params: CopywritingParams): GeneratedCopy {
  const {
    platform,
    objective,
    productName = 'Notre produit',
    productCategory = 'shopping',
    discount = 15,
    targetAudience = 'general',
    tone = 'casual',
    language = 'fr'
  } = params;

  // Determine category
  const category = objective === 'conversions' || objective === 'traffic' ? 'ecommerce' : 'service';

  // Get template
  const platformTemplates = COPY_TEMPLATES[platform] || COPY_TEMPLATES.facebook;
  const categoryTemplates = platformTemplates[category] || platformTemplates.ecommerce;
  const template = categoryTemplates[tone] || categoryTemplates.casual || Object.values(categoryTemplates)[0];

  // Replace variables
  const replaceVars = (text: string): string => {
    return text
      .replace(/\{\{productName\}\}/g, productName)
      .replace(/\{\{productCategory\}\}/g, productCategory)
      .replace(/\{\{discount\}\}/g, discount.toString())
      .replace(/\{\{targetAudience\}\}/g, targetAudience);
  };

  const title = replaceVars(template.title);
  const body = replaceVars(template.body);
  const cta = template.cta;

  // Generate hashtags
  const hashtags = template.hashtags?.map(replaceVars) || [];

  // Ensure length limits
  const specs = PLATFORM_SPECS[platform];
  const truncatedTitle = title.substring(0, specs.titleMaxLength);
  const truncatedBody = body.substring(0, specs.bodyMaxLength);

  return {
    title: truncatedTitle,
    body: truncatedBody,
    cta,
    hashtags: hashtags.slice(0, specs.optimalHashtags)
  };
}

/**
 * Generate multiple copy variants for A/B testing
 */
export function generateCopyVariants(params: CopywritingParams, count: number = 3): GeneratedCopy[] {
  const tones: Array<'professional' | 'casual' | 'trendy' | 'urgent'> = ['professional', 'casual', 'trendy', 'urgent'];
  const variants: GeneratedCopy[] = [];

  for (let i = 0; i < count; i++) {
    const tone = tones[i % tones.length];
    variants.push(generateCopy({ ...params, tone }));
  }

  return variants;
}

/**
 * Get optimal hashtags for platform and category
 */
export function getOptimalHashtags(
  platform: string,
  category: string,
  customHashtags: string[] = []
): string[] {
  const baseHashtags: Record<string, string[]> = {
    fashion: ['mode', 'style', 'fashion', 'ootd', 'shopping'],
    tech: ['tech', 'innovation', 'gadgets', 'digital', 'technology'],
    beauty: ['beauté', 'beauty', 'makeup', 'skincare', 'cosmetics'],
    food: ['food', 'foodie', 'cuisine', 'delicious', 'foodporn'],
    fitness: ['fitness', 'health', 'workout', 'gym', 'wellness'],
    travel: ['travel', 'voyage', 'adventure', 'wanderlust', 'explore']
  };

  const categoryHashtags = baseHashtags[category] || ['promo', 'nouveauté', 'shopping'];
  const specs = PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS] || PLATFORM_SPECS.facebook;

  const allHashtags = [...new Set([...categoryHashtags, ...customHashtags])];
  return allHashtags.slice(0, specs.optimalHashtags);
}

/**
 * Optimize copy for mobile viewing
 */
export function optimizeForMobile(copy: GeneratedCopy, platform: string): GeneratedCopy {
  // Mobile users prefer shorter, punchier copy
  const mobileTitle = copy.title.length > 30 ? copy.title.substring(0, 27) + '...' : copy.title;

  // Add line breaks for readability
  const mobileBody = copy.body.replace(/\. /g, '.\n\n');

  return {
    ...copy,
    title: mobileTitle,
    body: mobileBody
  };
}

/**
 * Calculate copy quality score
 */
export function calculateCopyScore(copy: GeneratedCopy, platform: string): number {
  let score = 100;
  const specs = PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS] || PLATFORM_SPECS.facebook;

  // Penalize for length violations
  if (copy.title.length > specs.titleMaxLength) score -= 20;
  if (copy.body.length > specs.bodyMaxLength) score -= 20;

  // Bonus for emojis (engagement boost)
  const emojiCount = (copy.title + copy.body).match(/[\u{1F300}-\u{1F9FF}]/gu)?.length || 0;
  if (emojiCount > 0 && emojiCount <= 3) score += 10;
  if (emojiCount > 3) score -= 5; // Too many emojis

  // Bonus for call-to-action presence
  if (copy.cta) score += 10;

  // Bonus for hashtags (social platforms)
  if (['instagram', 'tiktok', 'twitter'].includes(platform)) {
    if (copy.hashtags && copy.hashtags.length > 0) score += 10;
  }

  return Math.min(Math.max(score, 0), 100);
}
