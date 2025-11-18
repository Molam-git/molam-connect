/**
 * Storybook stories for CheckoutInline component
 * Demonstrates all variants and use cases
 */

import type { Meta, StoryObj } from '@storybook/react';
import { CheckoutInline } from './CheckoutInline';
import type { PaymentPayload, PaymentResult, SiraHints } from '../types';

const meta: Meta<typeof CheckoutInline> = {
  title: 'Components/CheckoutInline',
  component: CheckoutInline,
  tags: ['autodocs'],
  argTypes: {
    amount: {
      control: { type: 'number' },
      description: 'Payment amount in minor units (e.g., 5000 = 50.00)',
    },
    currency: {
      control: { type: 'select' },
      options: ['XOF', 'USD', 'EUR', 'GBP'],
      description: 'ISO 4217 currency code',
    },
    locale: {
      control: { type: 'select' },
      options: ['en', 'fr', 'wo'],
      description: 'BCP 47 locale code',
    },
    theme: {
      control: { type: 'select' },
      options: ['light', 'dark'],
      description: 'Theme variant',
    },
    onSubmit: {
      action: 'submitted',
      description: 'Payment submission handler',
    },
    onEvent: {
      action: 'event',
      description: 'Telemetry event handler',
    },
  },
};

export default meta;
type Story = StoryObj<typeof CheckoutInline>;

// Default mock handler
const mockSubmit = async (payload: PaymentPayload): Promise<PaymentResult> => {
  console.log('Payment payload:', payload);
  await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate API call
  return {
    success: true,
    transactionId: `txn_${Date.now()}`,
  };
};

// Basic checkout
export const Default: Story = {
  args: {
    amount: 5000,
    currency: 'XOF',
    locale: 'fr',
    onSubmit: mockSubmit,
  },
};

// With SIRA hints (wallet preferred)
export const WithSiraWallet: Story = {
  args: {
    amount: 10000,
    currency: 'XOF',
    locale: 'fr',
    onSubmit: mockSubmit,
    sira: {
      preferredMethod: 'wallet',
      confidence: 0.95,
      reasons: ['User has active Molam wallet', 'High success rate with wallet'],
    } as SiraHints,
  },
};

// With SIRA hints (card preferred)
export const WithSiraCard: Story = {
  args: {
    amount: 25000,
    currency: 'USD',
    locale: 'en',
    onSubmit: mockSubmit,
    sira: {
      preferredMethod: 'card',
      confidence: 0.87,
      reasons: ['User prefers card payments', 'Card success rate: 92%'],
    } as SiraHints,
  },
};

// High-risk transaction (fraud warning)
export const HighRiskTransaction: Story = {
  args: {
    amount: 100000,
    currency: 'XOF',
    locale: 'fr',
    onSubmit: mockSubmit,
    sira: {
      preferredMethod: 'wallet',
      fraudScore: 0.75,
      requireAdditionalVerification: true,
      confidence: 0.6,
      reasons: ['Unusual transaction amount', 'Additional verification required'],
    } as SiraHints,
  },
};

// Dark theme
export const DarkTheme: Story = {
  args: {
    amount: 5000,
    currency: 'EUR',
    locale: 'en',
    theme: 'dark',
    onSubmit: mockSubmit,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// Custom theme
export const CustomTheme: Story = {
  args: {
    amount: 7500,
    currency: 'USD',
    locale: 'en',
    theme: {
      primary: '#7c3aed',
      accent: '#10b981',
      background: '#ffffff',
      text: '#1f2937',
      error: '#ef4444',
      success: '#10b981',
      border: '#e5e7eb',
    },
    onSubmit: mockSubmit,
  },
};

// Wallet only (minimal)
export const WalletOnly: Story = {
  args: {
    amount: 2500,
    currency: 'XOF',
    locale: 'fr',
    allowedMethods: ['wallet'],
    onSubmit: mockSubmit,
  },
};

// Card only
export const CardOnly: Story = {
  args: {
    amount: 9999,
    currency: 'USD',
    locale: 'en',
    allowedMethods: ['card'],
    onSubmit: mockSubmit,
    config: {
      hostedFields: {
        tokenizationUrl: 'https://api.molam.co/v1/tokens',
      },
    },
  },
};

// With offline support
export const OfflineSupport: Story = {
  args: {
    amount: 3000,
    currency: 'XOF',
    locale: 'fr',
    allowedMethods: ['wallet', 'qr', 'ussd'],
    config: {
      features: {
        offlineMode: true,
        qrFallback: true,
        ussdFallback: true,
      },
    },
    onSubmit: mockSubmit,
  },
};

// Multi-language: English
export const EnglishLocale: Story = {
  args: {
    amount: 5000,
    currency: 'USD',
    locale: 'en',
    onSubmit: mockSubmit,
  },
};

// Multi-language: French
export const FrenchLocale: Story = {
  args: {
    amount: 5000,
    currency: 'XOF',
    locale: 'fr',
    onSubmit: mockSubmit,
  },
};

// Multi-language: Wolof
export const WolofLocale: Story = {
  args: {
    amount: 5000,
    currency: 'XOF',
    locale: 'wo',
    onSubmit: mockSubmit,
  },
};

// Error state (payment fails)
export const ErrorState: Story = {
  args: {
    amount: 5000,
    currency: 'XOF',
    locale: 'en',
    onSubmit: async (payload: PaymentPayload): Promise<PaymentResult> => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return {
        success: false,
        error: 'Insufficient funds',
        errorCode: 'INSUFFICIENT_FUNDS',
      };
    },
  },
};

// Loading state
export const LoadingState: Story = {
  args: {
    amount: 5000,
    currency: 'XOF',
    locale: 'fr',
    onSubmit: async (payload: PaymentPayload): Promise<PaymentResult> => {
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Long delay
      return { success: true, transactionId: 'txn_123' };
    },
  },
};

// Large amount
export const LargeAmount: Story = {
  args: {
    amount: 1000000000, // 10,000,000.00
    currency: 'XOF',
    locale: 'fr',
    onSubmit: mockSubmit,
  },
};

// Small amount
export const SmallAmount: Story = {
  args: {
    amount: 50, // 0.50
    currency: 'USD',
    locale: 'en',
    onSubmit: mockSubmit,
  },
};

// All methods available
export const AllMethods: Story = {
  args: {
    amount: 5000,
    currency: 'XOF',
    locale: 'fr',
    allowedMethods: ['wallet', 'card', 'bank', 'qr', 'ussd'],
    onSubmit: mockSubmit,
  },
};

// With auto-focus
export const WithAutoFocus: Story = {
  args: {
    amount: 5000,
    currency: 'XOF',
    locale: 'fr',
    autoFocus: true,
    onSubmit: mockSubmit,
  },
};
