/**
 * Hosted fields integration for PCI-compliant card tokenization
 * Loads and manages iframe-based secure card input fields
 */

import type { HostedFieldsConfig } from '../types';

const HOSTED_FIELDS_ORIGIN = process.env.REACT_APP_HOSTED_FIELDS_URL || 'https://hosted.molam.com';

export interface HostedFieldsInstance {
  tokenize: () => Promise<{ token: string; lastFour: string; cardType: string }>;
  clear: () => void;
  on: (event: string, callback: (data: any) => void) => void;
  destroy: () => void;
}

interface FieldContainers {
  cardNumber: HTMLElement;
  expiry: HTMLElement;
  cvv: HTMLElement;
}

/**
 * Mount hosted fields iframes into provided containers
 */
export async function mountHostedFields(
  containers: FieldContainers,
  config: HostedFieldsConfig
): Promise<HostedFieldsInstance> {
  const { clientToken, styles = {}, fields = {} } = config;

  // Create iframes for each field
  const iframes: Record<string, HTMLIFrameElement> = {};
  const eventHandlers: Record<string, Array<(data: any) => void>> = {
    tokenized: [],
    error: [],
    valid: [],
    invalid: [],
  };

  // Mount card number field
  if (fields.cardNumber !== false && containers.cardNumber) {
    iframes.cardNumber = createHostedIframe('card-number', clientToken, styles);
    containers.cardNumber.appendChild(iframes.cardNumber);
  }

  // Mount expiry field
  if (fields.expiryDate !== false && containers.expiry) {
    iframes.expiry = createHostedIframe('expiry', clientToken, styles);
    containers.expiry.appendChild(iframes.expiry);
  }

  // Mount CVV field
  if (fields.cvv !== false && containers.cvv) {
    iframes.cvv = createHostedIframe('cvv', clientToken, styles);
    containers.cvv.appendChild(iframes.cvv);
  }

  // Listen for postMessage events from iframes
  const messageHandler = (event: MessageEvent) => {
    if (event.origin !== HOSTED_FIELDS_ORIGIN) return;

    const { type, data } = event.data;

    switch (type) {
      case 'HOSTED_FIELDS_READY':
        // Iframes are ready for user input
        break;

      case 'HOSTED_FIELDS_TOKENIZED':
        eventHandlers.tokenized.forEach((cb) => cb(data));
        break;

      case 'HOSTED_FIELDS_ERROR':
        eventHandlers.error.forEach((cb) => cb(data));
        break;

      case 'HOSTED_FIELDS_VALID':
        eventHandlers.valid.forEach((cb) => cb(data));
        break;

      case 'HOSTED_FIELDS_INVALID':
        eventHandlers.invalid.forEach((cb) => cb(data));
        break;
    }
  };

  window.addEventListener('message', messageHandler);

  // Create instance API
  const instance: HostedFieldsInstance = {
    /**
     * Tokenize the card data
     */
    async tokenize() {
      return new Promise((resolve, reject) => {
        // Request tokenization from hosted fields
        Object.values(iframes).forEach((iframe) => {
          iframe.contentWindow?.postMessage(
            { type: 'TOKENIZE_REQUEST' },
            HOSTED_FIELDS_ORIGIN
          );
        });

        // Wait for tokenization response
        const tokenizeHandler = (data: any) => {
          if (data.error) {
            reject(new Error(data.error));
          } else {
            resolve(data);
          }
          // Remove handler after use
          eventHandlers.tokenized = eventHandlers.tokenized.filter((cb) => cb !== tokenizeHandler);
        };

        eventHandlers.tokenized.push(tokenizeHandler);

        // Timeout after 10 seconds
        setTimeout(() => {
          eventHandlers.tokenized = eventHandlers.tokenized.filter((cb) => cb !== tokenizeHandler);
          reject(new Error('Tokenization timeout'));
        }, 10000);
      });
    },

    /**
     * Clear all field values
     */
    clear() {
      Object.values(iframes).forEach((iframe) => {
        iframe.contentWindow?.postMessage(
          { type: 'CLEAR_FIELD' },
          HOSTED_FIELDS_ORIGIN
        );
      });
    },

    /**
     * Register event handler
     */
    on(event: string, callback: (data: any) => void) {
      if (eventHandlers[event]) {
        eventHandlers[event].push(callback);
      }
    },

    /**
     * Destroy instance and remove iframes
     */
    destroy() {
      window.removeEventListener('message', messageHandler);
      Object.values(iframes).forEach((iframe) => {
        iframe.remove();
      });
    },
  };

  return instance;
}

/**
 * Create a hosted field iframe
 */
function createHostedIframe(
  fieldType: string,
  clientToken: string,
  styles: any
): HTMLIFrameElement {
  const iframe = document.createElement('iframe');

  // Build iframe URL with parameters
  const params = new URLSearchParams({
    field: fieldType,
    token: clientToken,
    styles: JSON.stringify(styles),
  });

  iframe.src = `${HOSTED_FIELDS_ORIGIN}/hosted-field?${params.toString()}`;
  iframe.width = '100%';
  iframe.height = fieldType === 'card-number' ? '44' : '40';
  iframe.frameBorder = '0';
  iframe.scrolling = 'no';
  iframe.title = `Secure ${fieldType} input`;
  iframe.setAttribute('aria-label', `Secure ${fieldType} input field`);
  iframe.style.border = '0';
  iframe.style.display = 'block';

  // Security attributes
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  iframe.setAttribute('allow', 'payment');

  return iframe;
}

/**
 * Unmount and destroy hosted fields instance
 */
export function unmountHostedFields(instance: HostedFieldsInstance): void {
  instance.destroy();
}

/**
 * Loader script for standalone usage (can be included in HTML)
 */
export function loadHostedFieldsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).MolamHostedFields) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `${HOSTED_FIELDS_ORIGIN}/hosted-fields.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load hosted fields script'));

    document.head.appendChild(script);
  });
}
