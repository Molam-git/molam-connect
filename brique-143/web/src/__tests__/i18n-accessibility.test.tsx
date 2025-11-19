/**
 * BRIQUE 143 — i18n & Accessibility Tests
 * WCAG 2.1 AA compliance testing with jest-axe
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider, useI18n, LanguageSelector } from '../i18n';
import { AccessibleButton, AccessibleModal, AccessibleInput, SkipLink } from '../components/AccessibleButton';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

describe('I18n Provider', () => {
  test('renders with default language (en)', () => {
    function TestComponent() {
      const { lang } = useI18n();
      return <div>{lang}</div>;
    }

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    expect(screen.getByText('en')).toBeInTheDocument();
  });

  test('translates keys correctly', () => {
    function TestComponent() {
      const { t } = useI18n();
      return <div>{t('pay_now')}</div>;
    }

    render(
      <I18nProvider initialLang="en">
        <TestComponent />
      </I18nProvider>
    );

    expect(screen.getByText('Pay Now')).toBeInTheDocument();
  });

  test('translates nested keys', () => {
    function TestComponent() {
      const { t } = useI18n();
      return <div>{t('common.loading')}</div>;
    }

    render(
      <I18nProvider initialLang="en">
        <TestComponent />
      </I18nProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('changes language dynamically', () => {
    function TestComponent() {
      const { t, setLang } = useI18n();
      return (
        <div>
          <button onClick={() => setLang('fr')}>Change to French</button>
          <div>{t('pay_now')}</div>
        </div>
      );
    }

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    expect(screen.getByText('Pay Now')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Change to French'));

    waitFor(() => {
      expect(screen.getByText('Payer maintenant')).toBeInTheDocument();
    });
  });

  test('falls back to English for missing translations', () => {
    function TestComponent() {
      const { t } = useI18n();
      return <div>{t('nonexistent_key', 'Fallback')}</div>;
    }

    render(
      <I18nProvider initialLang="fr">
        <TestComponent />
      </I18nProvider>
    );

    expect(screen.getByText('Fallback')).toBeInTheDocument();
  });

  test('sets RTL for Arabic', () => {
    function TestComponent() {
      const { isRTL } = useI18n();
      return <div>{isRTL ? 'RTL' : 'LTR'}</div>;
    }

    const { rerender } = render(
      <I18nProvider initialLang="en">
        <TestComponent />
      </I18nProvider>
    );

    expect(screen.getByText('LTR')).toBeInTheDocument();

    rerender(
      <I18nProvider initialLang="ar">
        <TestComponent />
      </I18nProvider>
    );

    expect(screen.getByText('RTL')).toBeInTheDocument();
  });
});

describe('Language Selector', () => {
  test('renders all languages', () => {
    render(
      <I18nProvider>
        <LanguageSelector />
      </I18nProvider>
    );

    expect(screen.getByDisplayValue('English')).toBeInTheDocument();
  });

  test('changes language on select', async () => {
    render(
      <I18nProvider>
        <LanguageSelector />
      </I18nProvider>
    );

    const select = screen.getByLabelText(/language/i);
    fireEvent.change(select, { target: { value: 'fr' } });

    await waitFor(() => {
      expect(select).toHaveValue('fr');
    });
  });
});

describe('Accessible Button', () => {
  test('renders with proper ARIA attributes', () => {
    render(
      <I18nProvider>
        <AccessibleButton ariaLabel="Test button">Click me</AccessibleButton>
      </I18nProvider>
    );

    const button = screen.getByLabelText('Test button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Test button');
  });

  test('shows loading state', () => {
    render(
      <I18nProvider>
        <AccessibleButton loading>Click me</AccessibleButton>
      </I18nProvider>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  test('is disabled when loading', () => {
    render(
      <I18nProvider>
        <AccessibleButton loading>Click me</AccessibleButton>
      </I18nProvider>
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('has no accessibility violations', async () => {
    const { container } = render(
      <I18nProvider>
        <AccessibleButton>Click me</AccessibleButton>
      </I18nProvider>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('handles keyboard navigation', () => {
    const handleClick = jest.fn();

    render(
      <I18nProvider>
        <AccessibleButton onClick={handleClick}>Click me</AccessibleButton>
      </I18nProvider>
    );

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalled();
  });
});

describe('Accessible Modal', () => {
  test('renders when open', () => {
    render(
      <I18nProvider>
        <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </AccessibleModal>
      </I18nProvider>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
  });

  test('does not render when closed', () => {
    render(
      <I18nProvider>
        <AccessibleModal isOpen={false} onClose={() => {}} title="Test Modal">
          Content
        </AccessibleModal>
      </I18nProvider>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('has proper ARIA attributes', () => {
    render(
      <I18nProvider>
        <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </AccessibleModal>
      </I18nProvider>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
  });

  test('closes on Escape key', () => {
    const handleClose = jest.fn();

    render(
      <I18nProvider>
        <AccessibleModal isOpen={true} onClose={handleClose} title="Test Modal">
          Content
        </AccessibleModal>
      </I18nProvider>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(handleClose).toHaveBeenCalled();
  });

  test('has no accessibility violations', async () => {
    const { container } = render(
      <I18nProvider>
        <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </AccessibleModal>
      </I18nProvider>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('Accessible Input', () => {
  test('renders with label', () => {
    render(
      <I18nProvider>
        <AccessibleInput label="Email" />
      </I18nProvider>
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  test('shows required indicator', () => {
    render(
      <I18nProvider>
        <AccessibleInput label="Email" required />
      </I18nProvider>
    );

    expect(screen.getByLabelText(/required/i)).toBeInTheDocument();
  });

  test('shows error message', () => {
    render(
      <I18nProvider>
        <AccessibleInput label="Email" error="Invalid email" />
      </I18nProvider>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('shows helper text', () => {
    render(
      <I18nProvider>
        <AccessibleInput label="Email" helperText="We'll never share your email" />
      </I18nProvider>
    );

    expect(screen.getByText(/never share/i)).toBeInTheDocument();
  });

  test('has no accessibility violations', async () => {
    const { container } = render(
      <I18nProvider>
        <AccessibleInput label="Email" required />
      </I18nProvider>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('Skip Link', () => {
  test('renders skip link', () => {
    render(
      <I18nProvider>
        <SkipLink />
      </I18nProvider>
    );

    const link = screen.getByText(/skip to main content/i);
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '#main-content');
  });

  test('has no accessibility violations', async () => {
    const { container } = render(
      <I18nProvider>
        <SkipLink />
      </I18nProvider>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('Full page accessibility', () => {
  test('checkout button example has no violations', async () => {
    function CheckoutButton() {
      const { t } = useI18n();
      return (
        <AccessibleButton variant="primary" ariaLabel={t('pay_now')}>
          {t('pay_now')}
        </AccessibleButton>
      );
    }

    const { container } = render(
      <I18nProvider>
        <CheckoutButton />
      </I18nProvider>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('complete form has no violations', async () => {
    const { container } = render(
      <I18nProvider>
        <form>
          <AccessibleInput label="Email" type="email" required />
          <AccessibleInput label="Password" type="password" required />
          <AccessibleButton type="submit">Submit</AccessibleButton>
        </form>
      </I18nProvider>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
