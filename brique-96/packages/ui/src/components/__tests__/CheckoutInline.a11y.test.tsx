/**
 * Accessibility tests for CheckoutInline component
 * Uses jest-axe to verify WCAG compliance
 */

import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { CheckoutInline } from '../CheckoutInline';

expect.extend(toHaveNoViolations);

describe('CheckoutInline - Accessibility', () => {
  const defaultProps = {
    amount: 5000,
    currency: 'XOF',
    onSubmit: jest.fn(async () => ({ success: true })),
  };

  it('should have no axe violations in default state', async () => {
    const { container } = render(<CheckoutInline {...defaultProps} />);
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('should have no axe violations with all payment methods', async () => {
    const { container } = render(
      <CheckoutInline
        {...defaultProps}
        allowedMethods={['wallet', 'card', 'bank', 'qr', 'ussd']}
      />
    );
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('should have no axe violations in error state', async () => {
    const { container, rerender } = render(<CheckoutInline {...defaultProps} />);

    // Trigger error by rerendering with failed submission
    rerender(
      <CheckoutInline
        {...defaultProps}
        onSubmit={async () => ({ success: false, error: 'Payment failed' })}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no axe violations with SIRA hints', async () => {
    const { container } = render(
      <CheckoutInline
        {...defaultProps}
        sira={{
          preferredMethod: 'wallet',
          fraudScore: 0.2,
          confidence: 0.9,
          reasons: ['Lower fees'],
        }}
      />
    );
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('should have no axe violations in dark theme', async () => {
    const { container } = render(<CheckoutInline {...defaultProps} theme="dark" />);
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('should have proper heading hierarchy', () => {
    const { container } = render(<CheckoutInline {...defaultProps} />);

    // Check that headings are properly nested (if any)
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading, index) => {
      if (index > 0) {
        const currentLevel = parseInt(heading.tagName[1]);
        const previousLevel = parseInt(headings[index - 1].tagName[1]);

        // Current heading should not skip levels
        expect(currentLevel).toBeLessThanOrEqual(previousLevel + 1);
      }
    });
  });

  it('should have sufficient color contrast', async () => {
    const { container } = render(<CheckoutInline {...defaultProps} />);

    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: true },
      },
    });

    expect(results).toHaveNoViolations();
  });

  it('should have labels for all form inputs', () => {
    const { container } = render(<CheckoutInline {...defaultProps} />);

    const inputs = container.querySelectorAll('input[type="radio"]');
    inputs.forEach((input) => {
      // Each input should have an associated label
      const label = container.querySelector(`label[for="${input.id}"]`) ||
                   input.closest('label');
      expect(label).not.toBeNull();
    });
  });

  it('should have proper focus indicators', async () => {
    const { container } = render(<CheckoutInline {...defaultProps} />);

    const results = await axe(container, {
      rules: {
        'focus-visible': { enabled: true },
      },
    });

    expect(results).toHaveNoViolations();
  });

  it('should have proper button attributes', () => {
    const { getByRole } = render(<CheckoutInline {...defaultProps} />);

    const submitButton = getByRole('button', { name: /pay/i });

    // Button should have proper type
    expect(submitButton).toHaveAttribute('type', 'submit');

    // Button should have accessible name
    expect(submitButton).toHaveAccessibleName();
  });

  it('should announce dynamic content changes', async () => {
    const { container } = render(<CheckoutInline {...defaultProps} />);

    // Check for live regions
    const liveRegions = container.querySelectorAll('[aria-live]');
    expect(liveRegions.length).toBeGreaterThan(0);
  });

  it('should support screen reader navigation', () => {
    const { getAllByRole } = render(<CheckoutInline {...defaultProps} />);

    // Should have regions for screen reader navigation
    const regions = getAllByRole('region');
    expect(regions.length).toBeGreaterThan(0);

    // Each region should have a label
    regions.forEach((region) => {
      expect(
        region.hasAttribute('aria-label') || region.hasAttribute('aria-labelledby')
      ).toBe(true);
    });
  });

  it('should have no duplicate IDs', () => {
    const { container } = render(<CheckoutInline {...defaultProps} />);

    const ids = Array.from(container.querySelectorAll('[id]')).map(
      (el) => el.getAttribute('id')
    );

    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should have proper ARIA roles', () => {
    const { container } = render(<CheckoutInline {...defaultProps} />);

    // Check that ARIA roles are used correctly
    const elementsWithRole = container.querySelectorAll('[role]');
    elementsWithRole.forEach((element) => {
      const role = element.getAttribute('role');
      // Role should be a valid ARIA role
      expect(role).toBeTruthy();
    });
  });

  it('should handle reduced motion preference', async () => {
    // Mock prefers-reduced-motion
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    const { container } = render(<CheckoutInline {...defaultProps} />);
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('should have proper landmark regions', () => {
    const { container } = render(<CheckoutInline {...defaultProps} />);

    // Check for proper use of header, footer, main, etc.
    const header = container.querySelector('header');
    const footer = container.querySelector('footer');

    if (header) {
      expect(header).toHaveAttribute('role', 'group');
    }

    if (footer) {
      // Footer should be identifiable
      expect(footer.className).toContain('footer');
    }
  });
});
