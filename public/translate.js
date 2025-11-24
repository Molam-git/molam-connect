/**
 * Molam Connect Translation Helper
 * Provides client-side translation functionality with built-in multilingual dictionaries
 */

// Built-in translation dictionaries (fallback if backend not available)
const translationDictionaries = {
  fr: {
    // Header
    "Checking...": "Vérification...",
    // Payment Intent Tab
    "Create Payment Intent": "Créer une intention de paiement",
    "Test payment intent creation and confirmation flow": "Tester la création et confirmation d'intention de paiement",
    "Amount (in cents)": "Montant (en centimes)",
    "Currency": "Devise",
    "Description": "Description",
    "Confirm Payment": "Confirmer le paiement",
    "Payment Intent ID": "ID d'intention de paiement",
    "Client Secret": "Secret client",
    "Payment Method": "Méthode de paiement",
    // Auth Decision Tab
    "Make Auth Decision": "Prendre une décision d'authentification",
    "Test SIRA-powered authentication method selection": "Tester la sélection de méthode d'authentification SIRA",
    "Country": "Pays",
    "Card BIN (first 6 digits)": "BIN de carte (6 premiers chiffres)",
    "Device Fingerprint (optional)": "Empreinte d'appareil (optionnel)",
    "Make Decision": "Prendre une décision",
    // OTP Tab
    "OTP Flow": "Flux OTP",
    "Test OTP generation and verification": "Tester la génération et vérification OTP",
    "Create OTP": "Créer OTP",
    "Phone Number (E.164 format)": "Numéro de téléphone (format E.164)",
    "Method": "Méthode",
    "Send OTP": "Envoyer OTP",
    "Verify OTP": "Vérifier OTP",
    "OTP ID": "ID OTP",
    "OTP Code (check console for dev code)": "Code OTP (voir console pour code dev)",
    // Customer Tab
    "Create Customer": "Créer un client",
    "Test customer creation and management": "Tester la création et gestion de clients",
    "Email": "Email",
    "Name": "Nom",
    "Phone": "Téléphone",
    // Logs Tab
    "Activity Logs": "Journaux d'activité",
    "Real-time API activity": "Activité API en temps réel",
    "Clear Logs": "Effacer les journaux",
    // Common
    "Card": "Carte",
    "Mobile Money": "Mobile Money",
    "Bank Transfer": "Virement bancaire",
    "SMS": "SMS",
    "Voice": "Vocal",
  },

  wo: {
    // Wolof translations
    "Checking...": "Xool...",
    "Create Payment Intent": "Sos fajkat yu fay",
    "Test payment intent creation and confirmation flow": "Saytu sosante ak tabaxante fajkat",
    "Amount (in cents)": "Njëkk (ci centime)",
    "Currency": "Xaalis",
    "Description": "Melokaan",
    "Confirm Payment": "Tabaxal fay",
    "Payment Intent ID": "ID fajkat fay",
    "Client Secret": "Seret kiliyaan",
    "Payment Method": "Njëkk bu fay",
    "Make Auth Decision": "Tabaxal authentification",
    "Test SIRA-powered authentication method selection": "Saytu yoon bu SIRA",
    "Country": "Réew",
    "Card BIN (first 6 digits)": "BIN kart (6 chiffre)",
    "Device Fingerprint (optional)": "Takk aparey (warul diir)",
    "Make Decision": "Tabaxal",
    "OTP Flow": "Parcours OTP",
    "Test OTP generation and verification": "Saytu génération ak vérification OTP",
    "Create OTP": "Sos OTP",
    "Phone Number (E.164 format)": "Nimero telefon",
    "Method": "Yoon",
    "Send OTP": "Yónnee OTP",
    "Verify OTP": "Xool OTP",
    "OTP ID": "ID OTP",
    "OTP Code (check console for dev code)": "Code OTP (xool console)",
    "Create Customer": "Sos kiliyaan",
    "Test customer creation and management": "Saytu kiliyaan",
    "Email": "Email",
    "Name": "Tur",
    "Phone": "Telefon",
    "Activity Logs": "Journal yi",
    "Real-time API activity": "Liggeey API ci wakhtul réel",
    "Clear Logs": "Feesal journal",
    "Card": "Kart",
    "Mobile Money": "Mobile Money",
    "Bank Transfer": "Transfert bancaire",
    "SMS": "SMS",
    "Voice": "Nopp",
  },

  ar: {
    // Arabic translations
    "Checking...": "جاري التحقق...",
    "Create Payment Intent": "إنشاء نية الدفع",
    "Test payment intent creation and confirmation flow": "اختبار إنشاء وتأكيد نية الدفع",
    "Amount (in cents)": "المبلغ (بالسنتات)",
    "Currency": "العملة",
    "Description": "الوصف",
    "Confirm Payment": "تأكيد الدفع",
    "Payment Intent ID": "معرف نية الدفع",
    "Client Secret": "السر السري للعميل",
    "Payment Method": "طريقة الدفع",
    "Make Auth Decision": "اتخاذ قرار المصادقة",
    "Test SIRA-powered authentication method selection": "اختبار اختيار طريقة المصادقة بواسطة SIRA",
    "Country": "البلد",
    "Card BIN (first 6 digits)": "رقم BIN للبطاقة (أول 6 أرقام)",
    "Device Fingerprint (optional)": "بصمة الجهاز (اختياري)",
    "Make Decision": "اتخاذ القرار",
    "OTP Flow": "تدفق OTP",
    "Test OTP generation and verification": "اختبار إنشاء والتحقق من OTP",
    "Create OTP": "إنشاء OTP",
    "Phone Number (E.164 format)": "رقم الهاتف (تنسيق E.164)",
    "Method": "الطريقة",
    "Send OTP": "إرسال OTP",
    "Verify OTP": "التحقق من OTP",
    "OTP ID": "معرف OTP",
    "OTP Code (check console for dev code)": "رمز OTP (تحقق من وحدة التحكم)",
    "Create Customer": "إنشاء عميل",
    "Test customer creation and management": "اختبار إنشاء وإدارة العملاء",
    "Email": "البريد الإلكتروني",
    "Name": "الاسم",
    "Phone": "الهاتف",
    "Activity Logs": "سجلات النشاط",
    "Real-time API activity": "نشاط API في الوقت الفعلي",
    "Clear Logs": "مسح السجلات",
    "Card": "بطاقة",
    "Mobile Money": "المال المتنقل",
    "Bank Transfer": "تحويل مصرفي",
    "SMS": "رسالة نصية",
    "Voice": "الصوت",
  },

  es: {
    // Spanish translations
    "Checking...": "Verificando...",
    "Create Payment Intent": "Crear intención de pago",
    "Test payment intent creation and confirmation flow": "Probar creación y confirmación de intención de pago",
    "Amount (in cents)": "Monto (en centavos)",
    "Currency": "Moneda",
    "Description": "Descripción",
    "Confirm Payment": "Confirmar pago",
    "Payment Intent ID": "ID de intención de pago",
    "Client Secret": "Secreto del cliente",
    "Payment Method": "Método de pago",
    "Make Auth Decision": "Tomar decisión de autenticación",
    "Test SIRA-powered authentication method selection": "Probar selección de método de autenticación SIRA",
    "Country": "País",
    "Card BIN (first 6 digits)": "BIN de tarjeta (primeros 6 dígitos)",
    "Device Fingerprint (optional)": "Huella del dispositivo (opcional)",
    "Make Decision": "Tomar decisión",
    "OTP Flow": "Flujo OTP",
    "Test OTP generation and verification": "Probar generación y verificación OTP",
    "Create OTP": "Crear OTP",
    "Phone Number (E.164 format)": "Número de teléfono (formato E.164)",
    "Method": "Método",
    "Send OTP": "Enviar OTP",
    "Verify OTP": "Verificar OTP",
    "OTP ID": "ID OTP",
    "OTP Code (check console for dev code)": "Código OTP (verificar consola)",
    "Create Customer": "Crear cliente",
    "Test customer creation and management": "Probar creación y gestión de clientes",
    "Email": "Correo electrónico",
    "Name": "Nombre",
    "Phone": "Teléfono",
    "Activity Logs": "Registros de actividad",
    "Real-time API activity": "Actividad API en tiempo real",
    "Clear Logs": "Limpiar registros",
    "Card": "Tarjeta",
    "Mobile Money": "Dinero móvil",
    "Bank Transfer": "Transferencia bancaria",
    "SMS": "SMS",
    "Voice": "Voz",
  },

  pt: {
    // Portuguese translations
    "Checking...": "Verificando...",
    "Create Payment Intent": "Criar intenção de pagamento",
    "Test payment intent creation and confirmation flow": "Testar criação e confirmação de intenção de pagamento",
    "Amount (in cents)": "Valor (em centavos)",
    "Currency": "Moeda",
    "Description": "Descrição",
    "Confirm Payment": "Confirmar pagamento",
    "Payment Intent ID": "ID de intenção de pagamento",
    "Client Secret": "Segredo do cliente",
    "Payment Method": "Método de pagamento",
    "Make Auth Decision": "Tomar decisão de autenticação",
    "Test SIRA-powered authentication method selection": "Testar seleção de método de autenticação SIRA",
    "Country": "País",
    "Card BIN (first 6 digits)": "BIN do cartão (primeiros 6 dígitos)",
    "Device Fingerprint (optional)": "Impressão digital do dispositivo (opcional)",
    "Make Decision": "Tomar decisão",
    "OTP Flow": "Fluxo OTP",
    "Test OTP generation and verification": "Testar geração e verificação OTP",
    "Create OTP": "Criar OTP",
    "Phone Number (E.164 format)": "Número de telefone (formato E.164)",
    "Method": "Método",
    "Send OTP": "Enviar OTP",
    "Verify OTP": "Verificar OTP",
    "OTP ID": "ID OTP",
    "OTP Code (check console for dev code)": "Código OTP (verificar console)",
    "Create Customer": "Criar cliente",
    "Test customer creation and management": "Testar criação e gestão de clientes",
    "Email": "Email",
    "Name": "Nome",
    "Phone": "Telefone",
    "Activity Logs": "Registros de atividade",
    "Real-time API activity": "Atividade API em tempo real",
    "Clear Logs": "Limpar registros",
    "Card": "Cartão",
    "Mobile Money": "Dinheiro móvel",
    "Bank Transfer": "Transferência bancária",
    "SMS": "SMS",
    "Voice": "Voz",
  },
};

// Translation cache to avoid redundant API calls
const translationCache = new Map();

// Current language (default: English)
let currentLanguage = localStorage.getItem('molam_language') || 'en';

// Initialize language selector on page load
document.addEventListener('DOMContentLoaded', () => {
  const selector = document.getElementById('languageSelector');
  if (selector && currentLanguage) {
    selector.value = currentLanguage;

    // If language is not English, translate immediately
    if (currentLanguage !== 'en') {
      translatePageSync(currentLanguage);
    }
  }
});

/**
 * Translate text from source language to target language
 * @param {string} text - Text to translate
 * @param {string} sourceLang - Source language code (default: 'en')
 * @param {string} targetLang - Target language code (default: currentLanguage)
 * @param {string} namespace - Translation namespace (default: 'dashboard')
 * @returns {Promise<string>} Translated text
 */
async function translate(text, sourceLang = 'en', targetLang = currentLanguage, namespace = 'dashboard') {
  // Don't translate if source and target are the same
  if (sourceLang === targetLang) {
    return text;
  }

  // Check cache first
  const cacheKey = `${text}|${sourceLang}|${targetLang}|${namespace}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  // Use built-in dictionaries as primary source
  if (sourceLang === 'en' && translationDictionaries[targetLang]?.[text]) {
    const translated = translationDictionaries[targetLang][text];
    translationCache.set(cacheKey, translated);
    return translated;
  }

  // Try API for other languages or missing translations
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        sourceLang,
        targetLang,
        namespace,
      }),
    });

    if (!response.ok) {
      throw new Error('API error');
    }

    const data = await response.json();
    const translatedText = data.text || text;

    // Only cache if different from original
    if (translatedText !== text) {
      translationCache.set(cacheKey, translatedText);
    }

    return translatedText;
  } catch (error) {
    console.warn('Translation API not available, using fallback:', error.message);
    // Fallback to original text on error
    return text;
  }
}

/**
 * Translate an HTML element's text content
 * @param {HTMLElement} element - Element to translate
 * @param {string} sourceLang - Source language code
 */
async function translateElement(element, sourceLang = 'en') {
  if (!element || !element.textContent.trim()) return;

  const originalText = element.textContent.trim();

  // Store original text if not already stored
  if (!element.hasAttribute('data-original')) {
    element.setAttribute('data-original', originalText);
  }

  const translatedText = await translate(originalText, sourceLang, currentLanguage);

  if (translatedText !== originalText) {
    element.textContent = translatedText;
  }
}

/**
 * Translate all elements with data-translate attribute
 */
async function translatePage() {
  const elements = document.querySelectorAll('[data-translate]');

  for (const element of elements) {
    const sourceLang = element.getAttribute('data-source-lang') || 'en';
    await translateElement(element, sourceLang);
  }
}

/**
 * Set the current language and re-translate the page
 * @param {string} lang - Language code (e.g., 'fr', 'en', 'wo')
 */
function setLanguage(lang) {
  if (currentLanguage === lang) {
    return; // No change needed
  }

  console.log(`Changing language from ${currentLanguage} to ${lang}...`);

  currentLanguage = lang;
  localStorage.setItem('molam_language', lang);

  // Update language selector if it exists
  const selector = document.getElementById('languageSelector');
  if (selector) {
    selector.value = lang;
  }

  // If switching back to English, restore original text
  if (lang === 'en') {
    const elements = document.querySelectorAll('[data-original]');
    for (const element of elements) {
      element.textContent = element.getAttribute('data-original');
    }
    console.log(`✓ Restored to English (${elements.length} elements)`);
  } else {
    // Re-translate the page immediately (don't wait for async)
    translatePageSync(lang);
  }

  // Dispatch custom event for other scripts to react
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
}

/**
 * Synchronous translation for immediate UI update
 * @param {string} targetLang - Target language code
 */
function translatePageSync(targetLang) {
  const elements = document.querySelectorAll('[data-translate]');
  let translatedCount = 0;

  elements.forEach((element) => {
    if (!element) return;

    // Get the original English text (stored or current)
    let originalText;
    if (element.hasAttribute('data-original')) {
      // Use the stored original text
      originalText = element.getAttribute('data-original');
    } else {
      // First time: store current text as original
      originalText = element.textContent.trim();
      if (originalText) {
        element.setAttribute('data-original', originalText);
      }
    }

    if (!originalText) return;

    // Use built-in dictionary for instant translation
    if (translationDictionaries[targetLang]?.[originalText]) {
      element.textContent = translationDictionaries[targetLang][originalText];
      translatedCount++;
    } else {
      // Translation not found in dictionary - keep original or log warning
      console.warn(`Translation not found for "${originalText}" in ${targetLang}`);
    }
  });

  console.log(`✓ Translated ${translatedCount}/${elements.length} elements to ${targetLang}`);
}

/**
 * Get current language
 * @returns {string} Current language code
 */
function getCurrentLanguage() {
  return currentLanguage;
}

/**
 * Send feedback for incorrect translation
 * @param {string} sourceText - Original source text
 * @param {string} wrongTranslation - Incorrect translation
 * @param {string} correctedTranslation - Correct translation
 * @param {string} targetLang - Target language code
 */
async function submitTranslationFeedback(sourceText, wrongTranslation, correctedTranslation, targetLang) {
  try {
    await fetch('/api/translate/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceText,
        wrongTranslation,
        correctedTranslation,
        targetLang,
        userId: localStorage.getItem('user_id') || 'anonymous',
      }),
    });
    console.log('Translation feedback submitted');
  } catch (error) {
    console.error('Failed to submit translation feedback:', error);
  }
}

/**
 * Initialize translation system
 */
function initTranslation() {
  console.log('Translation system initialized. Current language:', currentLanguage);

  // Auto-translate page on load if not English
  if (currentLanguage !== 'en') {
    // Wait for DOM to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', translatePage);
    } else {
      translatePage();
    }
  }

  // Listen for dynamic content changes
  const observer = new MutationObserver((mutations) => {
    if (currentLanguage === 'en') return; // Skip if English

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const translatableElements = node.querySelectorAll('[data-translate]');
          translatableElements.forEach((element) => {
            translateElement(element);
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Auto-initialize on script load
if (typeof window !== 'undefined') {
  initTranslation();
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    translate,
    translateElement,
    translatePage,
    setLanguage,
    getCurrentLanguage,
    submitTranslationFeedback,
  };
}
