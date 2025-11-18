/**
 * Tests for CheckoutInline component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CheckoutInline } from '../CheckoutInline';
import type { PaymentPayload, PaymentResult } from '../../types';

// Mock fetch
global.fetch = jest.fn();

describe('CheckoutInline', () => {
  const defaultProps = {
    amount: 5000,
    currency: 'XOF',
    locale: 'en',
    onSubmit: jest.fn<Promise<PaymentResult>, [PaymentPayload]>(async () => ({
      success: true,
      transactionId: 'txn_123',
    })),
    onEvent: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders amount and payment methods', () => {
      render(<CheckoutInline {...defaultProps} />);

      expect(screen.getByText(/5,000/i)).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /secure payment/i })).toBeInTheDocument();
    });

    it('renders all allowed payment methods', () => {
      render(<CheckoutInline {...defaultProps} allowedMethods={['wallet', 'card', 'bank']} />);

      expect(screen.getByText(/wallet/i)).toBeInTheDocument();
      expect(screen.getByText(/card/i)).toBeInTheDocument();
      expect(screen.getByText(/bank/i)).toBeInTheDocument();
    });

    it('emits component_shown event on mount', () => {
      render(<CheckoutInline {...defaultProps} />);

      expect(defaultProps.onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'component_shown',
        })
      );
    });
  });

  describe('SIRA Integration', () => {
    it('selects preferred method from SIRA hint', () => {
      render(
        <CheckoutInline
          {...defaultProps}
          sira={{ preferredMethod: 'card', fraudScore: 0.2, confidence: 0.9 }}
          allowedMethods={['wallet', 'card']}
        />
      );

      const cardRadio = screen.getByLabelText(/card/i) as HTMLInputElement;
      expect(cardRadio.checked).toBe(true);
    });

    it('displays SIRA recommendation hint', () => {
      render(
        <CheckoutInline
          {...defaultProps}
          sira={{
            preferredMethod: 'wallet',
            confidence: 0.85,
            reasons: ['lower fees'],
          }}
        />
      );

      expect(screen.getByText(/recommended/i)).toBeInTheDocument();
      expect(screen.getByText(/lower fees/i)).toBeInTheDocument();
    });

    it('shows security notice for high-risk transactions', () => {
      render(
        <CheckoutInline
          {...defaultProps}
          sira={{
            fraudScore: 0.7,
            requireAdditionalVerification: true,
            preferredMethod: 'card',
          }}
        />
      );

      expect(screen.getByText(/additional verification/i)).toBeInTheDocument();
    });
  });

  describe('Payment Method Selection', () => {
    it('changes selected method on click', async () => {
      const user = userEvent.setup();
      render(<CheckoutInline {...defaultProps} allowedMethods={['wallet', 'card']} />);

      const cardOption = screen.getByLabelText(/card/i);
      await user.click(cardOption);

      expect(defaultProps.onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_method_selected',
          payload: expect.objectContaining({ method: 'card' }),
        })
      );
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<CheckoutInline {...defaultProps} allowedMethods={['wallet', 'card']} />);

      const cardOption = screen.getByLabelText(/card/i).parentElement!;

      // Focus and press Enter
      cardOption.focus();
      await user.keyboard('{Enter}');

      const cardRadio = screen.getByLabelText(/card/i) as HTMLInputElement;
      expect(cardRadio.checked).toBe(true);
    });
  });

  describe('Form Submission', () => {
    it('calls onSubmit with payment payload', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(async () => ({ success: true, transactionId: 'txn_123' }));

      render(<CheckoutInline {...defaultProps} onSubmit={onSubmit} />);

      const submitButton = screen.getByRole('button', { name: /pay/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: 5000,
            currency: 'XOF',
            method: expect.any(String),
          })
        );
      });
    });

    it('displays loading state during submission', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(<CheckoutInline {...defaultProps} onSubmit={onSubmit} />);

      const submitButton = screen.getByRole('button', { name: /pay/i });
      await user.click(submitButton);

      expect(screen.getByText(/processing/i)).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
    });

    it('displays error on submission failure', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(async () => ({
        success: false,
        error: 'Payment failed',
      }));

      render(<CheckoutInline {...defaultProps} onSubmit={onSubmit} />);

      const submitButton = screen.getByRole('button', { name: /pay/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/payment failed/i);
      });
    });

    it('emits telemetry events on success', async () => {
      const user = userEvent.setup();
      const onEvent = jest.fn();

      render(<CheckoutInline {...defaultProps} onEvent={onEvent} />);

      const submitButton = screen.getByRole('button', { name: /pay/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'checkout_success',
          })
        );
      });
    });
  });

  describe('Molam ID Integration', () => {
    it('fetches prefill data when token is provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          phone: '+221771234567',
          email: 'user@example.com',
          firstName: 'John',
        }),
      });

      render(<CheckoutInline {...defaultProps} molamIdToken="token_123" />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/molam-id/profile',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer token_123',
            }),
          })
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<CheckoutInline {...defaultProps} />);

      expect(screen.getByRole('region', { name: /secure payment/i })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: /payment amount/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pay/i })).toBeInTheDocument();
    });

    it('announces errors to screen readers', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(async () => ({
        success: false,
        error: 'Insufficient funds',
      }));

      render(<CheckoutInline {...defaultProps} onSubmit={onSubmit} />);

      const submitButton = screen.getByRole('button', { name: /pay/i });
      await user.click(submitButton);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveAttribute('aria-live', 'assertive');
        expect(alert).toHaveTextContent(/insufficient funds/i);
      });
    });

    it('supports keyboard-only navigation', async () => {
      const user = userEvent.setup();
      render(<CheckoutInline {...defaultProps} allowedMethods={['wallet', 'card']} />);

      // Tab through elements
      await user.tab();
      await user.tab();

      // Activate with keyboard
      await user.keyboard('{Enter}');

      // Should be able to reach submit button
      await user.tab();
      expect(screen.getByRole('button', { name: /pay/i })).toHaveFocus();
    });
  });

  describe('Theming', () => {
    it('applies light theme by default', () => {
      const { container } = render(<CheckoutInline {...defaultProps} />);

      expect(container.firstChild).toHaveClass('theme-light');
    });

    it('applies dark theme when specified', () => {
      const { container } = render(<CheckoutInline {...defaultProps} theme="dark" />);

      expect(container.firstChild).toHaveClass('theme-dark');
    });

    it('applies custom class name', () => {
      const { container } = render(<CheckoutInline {...defaultProps} className="custom-checkout" />);

      expect(container.firstChild).toHaveClass('custom-checkout');
    });
  });
});
