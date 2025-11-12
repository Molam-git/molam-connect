/**
 * Brique 70quinquies - AI Campaign Generator
 * Content Generation Service - Multilingual Support
 */

export interface ContentTemplate {
  subject: string;
  body: string;
  cta: string;
  slogan?: string;
}

export interface ContentVariables {
  customerName?: string;
  discountValue?: number;
  productName?: string;
  merchantName?: string;
  expiryDate?: string;
  [key: string]: any;
}

/**
 * Multilingual content templates for various campaign types
 */
const TEMPLATES: Record<string, Record<string, ContentTemplate>> = {
  abandoned_cart: {
    fr: {
      subject: 'Votre panier vous attend, {{customerName}} !',
      body: 'Bonjour {{customerName}},\n\nVous avez laissé {{productName}} dans votre panier. Profitez de {{discountValue}}% de réduction si vous finalisez votre commande maintenant.\n\nUtilisez le code: {{promoCode}}',
      cta: 'Finaliser ma commande',
      slogan: 'Ne laissez pas passer cette offre !'
    },
    en: {
      subject: 'Your cart is waiting, {{customerName}}!',
      body: 'Hi {{customerName}},\n\nYou left {{productName}} in your cart. Get {{discountValue}}% off if you complete your order now.\n\nUse code: {{promoCode}}',
      cta: 'Complete my order',
      slogan: 'Don\'t miss this offer!'
    },
    wo: {
      subject: 'Sa panier bi dalay gis, {{customerName}}!',
      body: 'Salam {{customerName}},\n\nYow démél {{productName}} ci sa panier. Amél {{discountValue}}% réduction bu nekk jaynée commande bi.\n\nJëfandikoo code: {{promoCode}}',
      cta: 'Jeunël sama commande',
      slogan: 'Bul dee walla ni!'
    },
    ar: {
      subject: 'سلة التسوق الخاصة بك في انتظارك يا {{customerName}}!',
      body: 'مرحبا {{customerName}}،\n\nلقد تركت {{productName}} في سلة التسوق. احصل على خصم {{discountValue}}٪ إذا أكملت طلبك الآن.\n\nاستخدم الرمز: {{promoCode}}',
      cta: 'إكمال الطلب',
      slogan: 'لا تفوت هذا العرض!'
    },
    pt: {
      subject: 'Seu carrinho está esperando, {{customerName}}!',
      body: 'Olá {{customerName}},\n\nVocê deixou {{productName}} no seu carrinho. Ganhe {{discountValue}}% de desconto se concluir seu pedido agora.\n\nUse o código: {{promoCode}}',
      cta: 'Concluir meu pedido',
      slogan: 'Não perca esta oferta!'
    }
  },
  welcome: {
    fr: {
      subject: 'Bienvenue chez {{merchantName}}, {{customerName}} !',
      body: 'Bonjour {{customerName}},\n\nMerci de nous avoir rejoint ! Pour célébrer votre inscription, profitez de {{discountValue}}% sur votre première commande.\n\nCode: {{promoCode}}\nValide jusqu\'au {{expiryDate}}',
      cta: 'Découvrir nos produits',
      slogan: 'Votre aventure commence ici'
    },
    en: {
      subject: 'Welcome to {{merchantName}}, {{customerName}}!',
      body: 'Hi {{customerName}},\n\nThank you for joining us! To celebrate your registration, enjoy {{discountValue}}% off your first order.\n\nCode: {{promoCode}}\nValid until {{expiryDate}}',
      cta: 'Discover our products',
      slogan: 'Your journey starts here'
    },
    wo: {
      subject: 'Dalal ak jàmm ci {{merchantName}}, {{customerName}}!',
      body: 'Salam {{customerName}},\n\nJërëjëf ngir sa inscription! Amél {{discountValue}}% ci sa première commande.\n\nCode: {{promoCode}}\nMotali ba {{expiryDate}}',
      cta: 'Gis sunu produits',
      slogan: 'Sa voyage tambali fi'
    },
    ar: {
      subject: 'مرحبا بك في {{merchantName}} يا {{customerName}}!',
      body: 'مرحبا {{customerName}}،\n\nشكرا للانضمام إلينا! احتفالا بتسجيلك، احصل على خصم {{discountValue}}٪ على طلبك الأول.\n\nالرمز: {{promoCode}}\nصالح حتى {{expiryDate}}',
      cta: 'اكتشف منتجاتنا',
      slogan: 'رحلتك تبدأ هنا'
    },
    pt: {
      subject: 'Bem-vindo ao {{merchantName}}, {{customerName}}!',
      body: 'Olá {{customerName}},\n\nObrigado por se juntar a nós! Para comemorar seu cadastro, aproveite {{discountValue}}% de desconto no seu primeiro pedido.\n\nCódigo: {{promoCode}}\nVálido até {{expiryDate}}',
      cta: 'Descobrir nossos produtos',
      slogan: 'Sua jornada começa aqui'
    }
  },
  reactivation: {
    fr: {
      subject: 'Ça nous manque de vous voir, {{customerName}}',
      body: 'Bonjour {{customerName}},\n\nCela fait un moment ! Nous avons de nouveaux produits qui pourraient vous plaire. Revenez avec {{discountValue}}% de réduction.\n\nCode: {{promoCode}}\nValable {{expiryDate}}',
      cta: 'Voir les nouveautés',
      slogan: 'Bon retour parmi nous !'
    },
    en: {
      subject: 'We miss seeing you, {{customerName}}',
      body: 'Hi {{customerName}},\n\nIt\'s been a while! We have new products you might like. Come back with {{discountValue}}% off.\n\nCode: {{promoCode}}\nValid until {{expiryDate}}',
      cta: 'See what\'s new',
      slogan: 'Welcome back!'
    },
    wo: {
      subject: 'Dañuy sañ sa gis, {{customerName}}',
      body: 'Salam {{customerName}},\n\nAmna ngir! Amñu produits yu bees yi mën nañ la nékk. Dellusi ak {{discountValue}}%.\n\nCode: {{promoCode}}\nValable {{expiryDate}}',
      cta: 'Gis yépp',
      slogan: 'Dalal dellu!'
    },
    ar: {
      subject: 'نحن نفتقدك يا {{customerName}}',
      body: 'مرحبا {{customerName}}،\n\nلقد مضى وقت طويل! لدينا منتجات جديدة قد تعجبك. عد مع خصم {{discountValue}}٪.\n\nالرمز: {{promoCode}}\nصالح حتى {{expiryDate}}',
      cta: 'انظر ما هو جديد',
      slogan: 'مرحبا بعودتك!'
    },
    pt: {
      subject: 'Sentimos sua falta, {{customerName}}',
      body: 'Olá {{customerName}},\n\nFaz tempo! Temos novos produtos que você pode gostar. Volte com {{discountValue}}% de desconto.\n\nCódigo: {{promoCode}}\nVálido até {{expiryDate}}',
      cta: 'Veja as novidades',
      slogan: 'Bem-vindo de volta!'
    }
  },
  vip_exclusive: {
    fr: {
      subject: 'Offre VIP exclusive pour vous, {{customerName}}',
      body: 'Cher {{customerName}},\n\nEn tant que client privilégié, accédez en avant-première à nos nouvelles collections avec {{discountValue}}% de réduction.\n\nCode VIP: {{promoCode}}\nAccès exclusif jusqu\'au {{expiryDate}}',
      cta: 'Accéder à l\'offre VIP',
      slogan: 'Parce que vous le valez bien'
    },
    en: {
      subject: 'Exclusive VIP offer for you, {{customerName}}',
      body: 'Dear {{customerName}},\n\nAs a valued customer, get early access to our new collections with {{discountValue}}% off.\n\nVIP Code: {{promoCode}}\nExclusive access until {{expiryDate}}',
      cta: 'Access VIP offer',
      slogan: 'Because you\'re worth it'
    },
    wo: {
      subject: 'Offre VIP exclusif ngir yow, {{customerName}}',
      body: 'Yow {{customerName}},\n\nNgir sama client bu mag, amél gis bu njëkk ci sunu collections bu bees ak {{discountValue}}%.\n\nCode VIP: {{promoCode}}\nAccès exclusif ba {{expiryDate}}',
      cta: 'Gis offre VIP',
      slogan: 'Ndax dafa war'
    },
    ar: {
      subject: 'عرض VIP حصري لك يا {{customerName}}',
      body: 'عزيزي {{customerName}}،\n\nكعميل مميز، احصل على وصول مبكر إلى مجموعاتنا الجديدة مع خصم {{discountValue}}٪.\n\nرمز VIP: {{promoCode}}\nوصول حصري حتى {{expiryDate}}',
      cta: 'الوصول إلى عرض VIP',
      slogan: 'لأنك تستحق ذلك'
    },
    pt: {
      subject: 'Oferta VIP exclusiva para você, {{customerName}}',
      body: 'Caro {{customerName}},\n\nComo cliente valorizado, tenha acesso antecipado às nossas novas coleções com {{discountValue}}% de desconto.\n\nCódigo VIP: {{promoCode}}\nAcesso exclusivo até {{expiryDate}}',
      cta: 'Acessar oferta VIP',
      slogan: 'Porque você merece'
    }
  },
  seasonal: {
    fr: {
      subject: 'Soldes d\'été chez {{merchantName}} !',
      body: 'Bonjour {{customerName}},\n\nProfitez de nos soldes d\'été avec jusqu\'à {{discountValue}}% de réduction sur une sélection de produits.\n\nCode: {{promoCode}}\nJusqu\'au {{expiryDate}}',
      cta: 'Voir les promotions',
      slogan: 'L\'été à petits prix'
    },
    en: {
      subject: 'Summer sale at {{merchantName}}!',
      body: 'Hi {{customerName}},\n\nEnjoy our summer sale with up to {{discountValue}}% off on selected products.\n\nCode: {{promoCode}}\nUntil {{expiryDate}}',
      cta: 'See promotions',
      slogan: 'Summer at great prices'
    },
    wo: {
      subject: 'Soldes été ci {{merchantName}}!',
      body: 'Salam {{customerName}},\n\nAmél sunu soldes été ak ba {{discountValue}}% réduction.\n\nCode: {{promoCode}}\nBa {{expiryDate}}',
      cta: 'Gis promotions',
      slogan: 'Été bu jafe prix'
    },
    ar: {
      subject: 'تخفيضات الصيف في {{merchantName}}!',
      body: 'مرحبا {{customerName}}،\n\nاستمتع بتخفيضات الصيف مع خصم يصل إلى {{discountValue}}٪ على منتجات مختارة.\n\nالرمز: {{promoCode}}\nحتى {{expiryDate}}',
      cta: 'شاهد العروض',
      slogan: 'الصيف بأسعار رائعة'
    },
    pt: {
      subject: 'Liquidação de verão na {{merchantName}}!',
      body: 'Olá {{customerName}},\n\nAproveite nossa liquidação de verão com até {{discountValue}}% de desconto em produtos selecionados.\n\nCódigo: {{promoCode}}\nAté {{expiryDate}}',
      cta: 'Ver promoções',
      slogan: 'Verão com ótimos preços'
    }
  }
};

/**
 * Generate campaign content with multilingual support
 */
export function generateContent(
  campaignType: string,
  language: string = 'fr',
  variables: ContentVariables = {}
): ContentTemplate {
  const template = TEMPLATES[campaignType]?.[language] || TEMPLATES[campaignType]?.['fr'];

  if (!template) {
    throw new Error(`Unknown campaign type: ${campaignType}`);
  }

  // Replace variables in template
  const replaceVars = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key]?.toString() || match;
    });
  };

  return {
    subject: replaceVars(template.subject),
    body: replaceVars(template.body),
    cta: replaceVars(template.cta),
    slogan: template.slogan ? replaceVars(template.slogan) : undefined
  };
}

/**
 * Generate personalized subject line variants for A/B testing
 */
export function generateSubjectVariants(
  baseSubject: string,
  language: string = 'fr'
): string[] {
  const variants: Record<string, string[]> = {
    fr: [
      baseSubject,
      `🎁 ${baseSubject}`,
      `⏰ ${baseSubject} - Offre limitée`,
      baseSubject.replace('!', ' 🔥')
    ],
    en: [
      baseSubject,
      `🎁 ${baseSubject}`,
      `⏰ ${baseSubject} - Limited offer`,
      baseSubject.replace('!', ' 🔥')
    ],
    wo: [
      baseSubject,
      `🎁 ${baseSubject}`,
      `⏰ ${baseSubject} - Offre limitée`,
      baseSubject
    ],
    ar: [
      baseSubject,
      `🎁 ${baseSubject}`,
      `⏰ ${baseSubject} - عرض محدود`,
      baseSubject
    ],
    pt: [
      baseSubject,
      `🎁 ${baseSubject}`,
      `⏰ ${baseSubject} - Oferta limitada`,
      baseSubject.replace('!', ' 🔥')
    ]
  };

  return variants[language] || variants['fr'];
}

/**
 * Get optimal send time based on audience timezone and behavior
 */
export function getOptimalSendTime(timezone: string, audienceType: string): Date {
  const now = new Date();
  const targetHour = audienceType === 'b2b' ? 10 : 18; // B2B morning, B2C evening

  const sendTime = new Date(now);
  sendTime.setHours(targetHour, 0, 0, 0);

  // If time passed today, schedule for tomorrow
  if (sendTime < now) {
    sendTime.setDate(sendTime.getDate() + 1);
  }

  return sendTime;
}

/**
 * Generate SMS content (shorter version)
 */
export function generateSMSContent(
  campaignType: string,
  language: string = 'fr',
  variables: ContentVariables = {}
): string {
  const templates: Record<string, Record<string, string>> = {
    abandoned_cart: {
      fr: '{{merchantName}}: Votre panier attend! -{{discountValue}}% avec {{promoCode}}. Offre valable 24h.',
      en: '{{merchantName}}: Your cart awaits! -{{discountValue}}% with {{promoCode}}. Valid 24h.',
      wo: '{{merchantName}}: Sa panier dalay gis! -{{discountValue}}% ak {{promoCode}}. 24h.',
      ar: '{{merchantName}}: سلتك في الانتظار! خصم {{discountValue}}٪ مع {{promoCode}}. صالح 24 ساعة.',
      pt: '{{merchantName}}: Seu carrinho espera! -{{discountValue}}% com {{promoCode}}. Válido 24h.'
    },
    flash_sale: {
      fr: '⚡ FLASH {{merchantName}}: -{{discountValue}}% pendant 2h! Code: {{promoCode}}',
      en: '⚡ FLASH {{merchantName}}: -{{discountValue}}% for 2h! Code: {{promoCode}}',
      wo: '⚡ FLASH {{merchantName}}: -{{discountValue}}% ci 2h! Code: {{promoCode}}',
      ar: '⚡ عرض {{merchantName}}: خصم {{discountValue}}٪ لمدة ساعتين! الرمز: {{promoCode}}',
      pt: '⚡ FLASH {{merchantName}}: -{{discountValue}}% por 2h! Código: {{promoCode}}'
    }
  };

  const template = templates[campaignType]?.[language] || templates[campaignType]?.['fr'] || '';

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key]?.toString() || match;
  });
}
