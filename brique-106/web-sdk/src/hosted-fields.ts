/**
 * Hosted Fields implementation for PCI compliance.
 *
 * Uses secure iFrames to isolate card data from merchant's domain.
 */

import {
  MolamFormConfig,
  CardDetails,
  HostedFieldType,
  HostedFieldState,
  HostedFieldsChangeEvent,
  EventCallback,
} from './types';

const HOSTED_FIELDS_URL = 'https://js.molam.com/v1/hosted-fields.html';

/**
 * Hosted Fields manager.
 */
export class HostedFields {
  private config: MolamFormConfig;
  private container: HTMLElement;
  private iframes: Map<HostedFieldType, HTMLIFrameElement> = new Map();
  private fieldStates: Map<HostedFieldType, HostedFieldState> = new Map();
  private eventHandlers: Map<string, Set<EventCallback>> = new Map();
  private messageListener: ((event: MessageEvent) => void) | null = null;

  constructor(config: MolamFormConfig, container: HTMLElement) {
    this.config = config;
    this.container = container;
  }

  /**
   * Initialize hosted fields.
   */
  async initialize(): Promise<void> {
    // Create container structure
    this._createStructure();

    // Create iFrames for each field
    await this._createFields();

    // Set up message listener
    this._setupMessageListener();

    // Apply custom styles
    this._applyStyles();

    this._emit('ready');
  }

  /**
   * Create HTML structure.
   *
   * @private
   */
  private _createStructure(): void {
    this.container.innerHTML = `
      <div class="molam-form-container ${this.config.theme || 'minimal'}">
        <div class="molam-form-fields">
          <div class="molam-field-group">
            <label for="molam-card-number">Card Number</label>
            <div id="molam-card-number" class="molam-field"></div>
          </div>
          <div class="molam-field-row">
            <div class="molam-field-group">
              <label for="molam-card-expiry">Expiry</label>
              <div id="molam-card-expiry" class="molam-field"></div>
            </div>
            <div class="molam-field-group">
              <label for="molam-card-cvc">CVC</label>
              <div id="molam-card-cvc" class="molam-field"></div>
            </div>
          </div>
          <div class="molam-field-group">
            <label for="molam-cardholder-name">Cardholder Name</label>
            <div id="molam-cardholder-name" class="molam-field"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create iFrame fields.
   *
   * @private
   */
  private async _createFields(): Promise<void> {
    const fields: HostedFieldType[] = [
      'cardNumber',
      'cardExpiry',
      'cardCvc',
      'cardholderName',
    ];

    for (const fieldType of fields) {
      await this._createField(fieldType);
    }
  }

  /**
   * Create individual field.
   *
   * @param fieldType - Field type
   * @private
   */
  private async _createField(fieldType: HostedFieldType): Promise<void> {
    const containerId = this._getFieldContainerId(fieldType);
    const container = document.getElementById(containerId);

    if (!container) {
      throw new Error(`Container not found for field: ${fieldType}`);
    }

    // Create iFrame
    const iframe = document.createElement('iframe');
    iframe.src = `${HOSTED_FIELDS_URL}?field=${fieldType}&key=${this.config.publishableKey}`;
    iframe.style.width = '100%';
    iframe.style.height = '40px';
    iframe.style.border = 'none';
    iframe.frameBorder = '0';
    iframe.scrolling = 'no';
    iframe.setAttribute('data-field-type', fieldType);

    // Wait for iframe to load
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      container.appendChild(iframe);
    });

    this.iframes.set(fieldType, iframe);

    // Initialize field state
    this.fieldStates.set(fieldType, {
      empty: true,
      complete: false,
    });

    // Send configuration to iframe
    this._sendMessageToField(fieldType, {
      type: 'init',
      config: {
        locale: this.config.locale,
        theme: this.config.theme,
        styles: this.config.styles,
      },
    });
  }

  /**
   * Get field container ID.
   *
   * @param fieldType - Field type
   * @private
   */
  private _getFieldContainerId(fieldType: HostedFieldType): string {
    const mapping: Record<HostedFieldType, string> = {
      cardNumber: 'molam-card-number',
      cardExpiry: 'molam-card-expiry',
      cardCvc: 'molam-card-cvc',
      cardholderName: 'molam-cardholder-name',
    };
    return mapping[fieldType];
  }

  /**
   * Set up message listener for iframe communication.
   *
   * @private
   */
  private _setupMessageListener(): void {
    this.messageListener = (event: MessageEvent) => {
      // Verify origin
      if (!event.origin.includes('molam.com')) {
        return;
      }

      const { type, field, data } = event.data;

      if (type === 'field:change') {
        this._handleFieldChange(field, data);
      } else if (type === 'field:focus') {
        this._handleFieldFocus(field);
      } else if (type === 'field:blur') {
        this._handleFieldBlur(field);
      } else if (type === 'field:error') {
        this._handleFieldError(field, data);
      }
    };

    window.addEventListener('message', this.messageListener);
  }

  /**
   * Handle field change event.
   *
   * @param field - Field type
   * @param state - Field state
   * @private
   */
  private _handleFieldChange(field: HostedFieldType, state: HostedFieldState): void {
    this.fieldStates.set(field, state);

    // Check if all fields are complete
    const allComplete = Array.from(this.fieldStates.values()).every(
      (s) => s.complete
    );

    // Check if any field has error
    const hasError = Array.from(this.fieldStates.values()).some((s) => s.error);

    const changeEvent: HostedFieldsChangeEvent = {
      field,
      state,
      complete: allComplete,
      error: hasError,
    };

    this._emit('change', changeEvent);
  }

  /**
   * Handle field focus event.
   *
   * @param field - Field type
   * @private
   */
  private _handleFieldFocus(field: HostedFieldType): void {
    this._emit('focus', { field });
  }

  /**
   * Handle field blur event.
   *
   * @param field - Field type
   * @private
   */
  private _handleFieldBlur(field: HostedFieldType): void {
    this._emit('blur', { field });
  }

  /**
   * Handle field error event.
   *
   * @param field - Field type
   * @param error - Error details
   * @private
   */
  private _handleFieldError(field: HostedFieldType, error: any): void {
    this._emit('error', { field, error });
  }

  /**
   * Get card details from hosted fields.
   */
  async getCardDetails(): Promise<CardDetails> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for card details'));
      }, 5000);

      // Request card details from each field
      const listener = (event: MessageEvent) => {
        if (!event.origin.includes('molam.com')) {
          return;
        }

        const { type, data } = event.data;

        if (type === 'card:details') {
          clearTimeout(timeout);
          window.removeEventListener('message', listener);
          resolve(data);
        } else if (type === 'card:error') {
          clearTimeout(timeout);
          window.removeEventListener('message', listener);
          reject(new Error(data.message));
        }
      };

      window.addEventListener('message', listener);

      // Request details from card number field (it will collect all)
      this._sendMessageToField('cardNumber', { type: 'get:details' });
    });
  }

  /**
   * Send message to field iframe.
   *
   * @param field - Field type
   * @param message - Message to send
   * @private
   */
  private _sendMessageToField(field: HostedFieldType, message: any): void {
    const iframe = this.iframes.get(field);
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(message, '*');
    }
  }

  /**
   * Apply custom styles.
   *
   * @private
   */
  private _applyStyles(): void {
    // Load custom fonts
    if (this.config.fonts && this.config.fonts.length > 0) {
      const style = document.createElement('style');
      let fontFaces = '';

      this.config.fonts.forEach((font) => {
        fontFaces += `
          @font-face {
            font-family: '${font.family}';
            src: url('${font.src}');
            font-weight: ${font.weight || 'normal'};
            font-style: ${font.style || 'normal'};
          }
        `;
      });

      style.textContent = fontFaces;
      document.head.appendChild(style);
    }
  }

  /**
   * Update configuration.
   *
   * @param config - Partial configuration
   */
  updateConfig(config: Partial<MolamFormConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    // Send updated config to all fields
    this.iframes.forEach((iframe, field) => {
      this._sendMessageToField(field, {
        type: 'update:config',
        config: {
          locale: this.config.locale,
          theme: this.config.theme,
          styles: this.config.styles,
        },
      });
    });
  }

  /**
   * Register event listener.
   *
   * @param event - Event name
   * @param callback - Event callback
   */
  on(event: string, callback: EventCallback): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
  }

  /**
   * Unregister event listener.
   *
   * @param event - Event name
   * @param callback - Event callback
   */
  off(event: string, callback: EventCallback): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  /**
   * Emit event.
   *
   * @param event - Event name
   * @param data - Event data
   * @private
   */
  private _emit(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((callback) => callback(data));
    }
  }

  /**
   * Destroy hosted fields.
   */
  destroy(): void {
    // Remove message listener
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }

    // Remove iframes
    this.iframes.forEach((iframe) => {
      iframe.remove();
    });

    this.iframes.clear();
    this.fieldStates.clear();
    this.eventHandlers.clear();

    // Clear container
    this.container.innerHTML = '';
  }
}
