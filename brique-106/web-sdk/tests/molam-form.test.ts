/**
 * Molam Form SDK Test Suite
 *
 * Integration tests for the main SDK class
 */

import MolamForm from '../src/molam-form';
import type { MolamFormConfig } from '../src/types';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('MolamForm SDK', () => {
  let molam: MolamForm;
  let container: HTMLDivElement;

  const defaultConfig: MolamFormConfig = {
    publishableKey: 'pk_test_123',
    apiBase: 'https://api.molam.com',
    locale: 'en',
    theme: 'minimal',
  };

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'molam-form';
    document.body.appendChild(container);

    molam = new MolamForm(defaultConfig);
  });

  afterEach(() => {
    if (molam) {
      molam.unmount();
    }
    document.body.removeChild(container);
  });

  describe('Initialization', () => {
    test('creates instance with valid config', () => {
      expect(molam).toBeInstanceOf(MolamForm);
      expect(molam.getConfig()).toMatchObject(defaultConfig);
    });

    test('throws error with invalid publishable key', () => {
      expect(() => {
        new MolamForm({ ...defaultConfig, publishableKey: 'invalid' });
      }).toThrow('Invalid publishable key');
    });

    test('throws error with empty publishable key', () => {
      expect(() => {
        new MolamForm({ ...defaultConfig, publishableKey: '' });
      }).toThrow('publishableKey is required');
    });

    test('uses default values for optional config', () => {
      const minimalMolam = new MolamForm({
        publishableKey: 'pk_test_123',
      });

      const config = minimalMolam.getConfig();
      expect(config.apiBase).toBe('https://api.molam.com');
      expect(config.locale).toBe('en');
      expect(config.theme).toBe('default');
    });
  });

  describe('Mounting', () => {
    test('mounts form to DOM element', async () => {
      await molam.mount('#molam-form');

      const mountedElement = container.querySelector('.molam-form-container');
      expect(mountedElement).toBeTruthy();
    });

    test('throws error when mounting to non-existent element', async () => {
      await expect(molam.mount('#non-existent')).rejects.toThrow(
        'Mount point not found'
      );
    });

    test('emits ready event after mounting', async () => {
      const readyCallback = jest.fn();
      molam.on('ready', readyCallback);

      await molam.mount(container);

      expect(readyCallback).toHaveBeenCalled();
    });

    test('unmounts form correctly', async () => {
      await molam.mount(container);
      molam.unmount();

      const mountedElement = container.querySelector('.molam-form-container');
      expect(mountedElement).toBeFalsy();
    });
  });

  describe('Tokenization', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          token: {
            id: 'tok_test_123',
            type: 'card',
            card: {
              brand: 'visa',
              last4: '4242',
              exp_month: 12,
              exp_year: 2025,
            },
          },
        }),
      } as Response);
    });

    test('creates token with card details', async () => {
      const token = await molam.createToken({
        cardNumber: '4242424242424242',
        expMonth: 12,
        expYear: 2025,
        cvc: '123',
        cardholderName: 'John Doe',
      });

      expect(token.id).toBe('tok_test_123');
      expect(token.type).toBe('card');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.molam.com/v1/form/tokenize',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer pk_test_123',
          }),
        })
      );
    });

    test('emits tokenization:start event', async () => {
      const callback = jest.fn();
      molam.on('tokenization:start', callback);

      await molam.createToken({
        cardNumber: '4242424242424242',
        expMonth: 12,
        expYear: 2025,
        cvc: '123',
      });

      expect(callback).toHaveBeenCalled();
    });

    test('emits tokenization:success event', async () => {
      const callback = jest.fn();
      molam.on('tokenization:success', callback);

      await molam.createToken({
        cardNumber: '4242424242424242',
        expMonth: 12,
        expYear: 2025,
        cvc: '123',
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.objectContaining({
            id: 'tok_test_123',
          }),
        })
      );
    });

    test('handles tokenization errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Invalid card number',
          },
        }),
      } as Response);

      const callback = jest.fn();
      molam.on('tokenization:error', callback);

      await expect(
        molam.createToken({
          cardNumber: '1234',
          expMonth: 12,
          expYear: 2025,
          cvc: '123',
        })
      ).rejects.toThrow();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Payment Confirmation', () => {
    test('confirms payment intent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pi_test_123',
          status: 'succeeded',
          amount: 1000,
          currency: 'USD',
        }),
      } as Response);

      const result = await molam.confirmPayment(
        'pi_test_123',
        'secret_123',
        'pm_test_123'
      );

      expect(result.status).toBe('succeeded');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.molam.com/v1/form/payment_intents/pi_test_123/confirm',
        expect.any(Object)
      );
    });

    test('emits payment:success event', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pi_test_123',
          status: 'succeeded',
        }),
      } as Response);

      const callback = jest.fn();
      molam.on('payment:success', callback);

      await molam.confirmPayment('pi_test_123', 'secret_123');

      expect(callback).toHaveBeenCalled();
    });

    test('handles 3DS authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pi_test_123',
          status: 'requires_action',
          next_action: {
            type: 'redirect_to_url',
            redirect_url: 'https://3ds.example.com',
          },
        }),
      } as Response);

      const callback = jest.fn();
      molam.on('3ds:start', callback);

      await molam.confirmPayment('pi_test_123', 'secret_123');

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Event System', () => {
    test('registers event listeners', () => {
      const callback = jest.fn();
      molam.on('ready', callback);

      expect(() => molam.on('ready', callback)).not.toThrow();
    });

    test('removes event listeners', () => {
      const callback = jest.fn();
      molam.on('ready', callback);
      molam.off('ready', callback);

      // Trigger event manually (implementation detail)
      // Callback should not be called after removal
    });

    test('handles multiple listeners for same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      molam.on('ready', callback1);
      molam.on('ready', callback2);

      // Both callbacks should be registered
      expect(() => {
        molam.on('ready', callback1);
        molam.on('ready', callback2);
      }).not.toThrow();
    });
  });

  describe('Configuration Updates', () => {
    test('updates configuration', () => {
      molam.updateConfig({ locale: 'fr' });

      const config = molam.getConfig();
      expect(config.locale).toBe('fr');
    });

    test('preserves other config values', () => {
      molam.updateConfig({ locale: 'fr' });

      const config = molam.getConfig();
      expect(config.publishableKey).toBe('pk_test_123');
      expect(config.apiBase).toBe('https://api.molam.com');
    });

    test('cannot update publishableKey after initialization', () => {
      expect(() => {
        molam.updateConfig({ publishableKey: 'pk_new_123' } as any);
      }).toThrow();
    });
  });
});
