# Contributing to @molam/ui

Thank you for your interest in contributing to Molam UI! This document provides guidelines and instructions for contributing.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Accessibility Requirements](#accessibility-requirements)
7. [Pull Request Process](#pull-request-process)
8. [Release Process](#release-process)

---

## Code of Conduct

### Our Standards

- **Be respectful**: Treat everyone with respect and kindness
- **Be collaborative**: Work together to solve problems
- **Be inclusive**: Welcome contributors of all backgrounds and skill levels
- **Be constructive**: Provide helpful feedback and suggestions

### Unacceptable Behavior

- Harassment, discrimination, or personal attacks
- Trolling, insulting comments, or inflammatory language
- Publishing others' private information without permission
- Any conduct that would be inappropriate in a professional setting

---

## Getting Started

### Prerequisites

- Node.js 16.x or higher
- npm 8.x or higher (or yarn/pnpm equivalent)
- Git
- A code editor (VS Code recommended)

### Initial Setup

1. **Fork the repository**
   ```bash
   # On GitHub, click "Fork" button
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/molam-ui.git
   cd molam-ui/brique-96/packages/ui
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Start Storybook (optional)**
   ```bash
   npm run storybook
   ```

---

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:
- `feature/` - New features (e.g., `feature/add-paypal-support`)
- `fix/` - Bug fixes (e.g., `fix/card-validation-error`)
- `docs/` - Documentation changes (e.g., `docs/update-readme`)
- `refactor/` - Code refactoring (e.g., `refactor/simplify-currency-utils`)
- `test/` - Test improvements (e.g., `test/add-wallet-tests`)
- `chore/` - Maintenance tasks (e.g., `chore/update-dependencies`)

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic changes)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:
```
feat(checkout): add PayPal payment method

Add PayPal as a new payment method with hosted redirect flow.
Includes icon, translations, and tests.

Closes #123
```

```
fix(card): resolve CVV validation issue

CVV was not properly validated for Amex cards (4 digits).
Updated validation regex to handle 3-4 digit CVVs.

Fixes #456
```

### Development Commands

```bash
# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run linter
npm run lint

# Fix linting errors
npm run lint:fix

# Type check
npm run type-check

# Build package
npm run build

# Start Storybook
npm run storybook

# Build Storybook
npm run build-storybook
```

---

## Coding Standards

### TypeScript

- **Use TypeScript** for all new code
- **Strict mode enabled**: No `any` without justification
- **Prefer interfaces** over types for object shapes
- **Use explicit return types** for functions

**Good**:
```typescript
interface PaymentMethod {
  id: string;
  name: string;
}

function formatPaymentMethod(method: PaymentMethod): string {
  return `${method.id}: ${method.name}`;
}
```

**Bad**:
```typescript
function formatPaymentMethod(method: any) {
  return `${method.id}: ${method.name}`;
}
```

### React

- **Use functional components** with hooks
- **Use TypeScript** for prop types (no PropTypes)
- **Extract complex logic** into custom hooks
- **Memoize expensive computations** with useMemo
- **Avoid inline arrow functions** in JSX (causes re-renders)

**Good**:
```typescript
interface Props {
  amount: number;
  currency: string;
}

export const AmountDisplay: React.FC<Props> = ({ amount, currency }) => {
  const formattedAmount = useMemo(
    () => formatCurrency(amount, currency),
    [amount, currency]
  );

  return <div>{formattedAmount}</div>;
};
```

**Bad**:
```typescript
export const AmountDisplay = (props: any) => {
  return <div>{formatCurrency(props.amount, props.currency)}</div>;
};
```

### Styling

- **Use CSS variables** for theming
- **Use BEM naming** for CSS classes
- **Mobile-first** responsive design
- **Avoid inline styles** (use classes)
- **Use design tokens** from tokens.css

**Good**:
```css
.molam-checkout__submit-button {
  background: var(--molam-primary);
  border-radius: var(--molam-radius-lg);
  padding: var(--molam-space-4);
}

.molam-checkout__submit-button:hover {
  background: var(--molam-primary-hover);
}
```

**Bad**:
```tsx
<button style={{ background: '#0a84ff', padding: '16px' }}>
  Pay
</button>
```

### File Organization

```
src/
├── components/          # React components
│   ├── CheckoutInline.tsx
│   ├── methods/         # Payment method components
│   └── __tests__/       # Component tests
├── utils/               # Utility functions
│   ├── currency.ts
│   └── __tests__/       # Utility tests
├── types.ts             # Type definitions
└── index.ts             # Main entry point
```

---

## Testing Guidelines

### Unit Tests

- **Test behavior, not implementation**: Focus on what users see/do
- **Use Testing Library**: Prefer user-centric queries (getByRole, getByLabelText)
- **Mock external dependencies**: API calls, localStorage, etc.
- **Test edge cases**: Empty states, errors, loading states

**Example**:
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckoutInline } from '../CheckoutInline';

describe('CheckoutInline', () => {
  it('submits payment when form is valid', async () => {
    const onSubmit = jest.fn(async () => ({ success: true }));
    render(<CheckoutInline amount={5000} currency="XOF" onSubmit={onSubmit} />);

    // User interaction
    await userEvent.click(screen.getByRole('button', { name: /pay/i }));

    // Assertion
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        currency: 'XOF',
      })
    );
  });
});
```

### Accessibility Tests

- **Use jest-axe**: Automated accessibility testing
- **Test with keyboard**: Tab, Enter, Space navigation
- **Test screen reader announcements**: aria-live regions

**Example**:
```typescript
import { axe } from 'jest-axe';

it('should have no accessibility violations', async () => {
  const { container } = render(<CheckoutInline {...props} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Coverage Requirements

- **Minimum 70% coverage** for all code
- **Focus on critical paths**: Payment submission, error handling
- **Don't obsess over 100%**: Some code is hard to test meaningfully

---

## Accessibility Requirements

All contributions must meet **WCAG AA** standards:

### Required

- ✅ **Semantic HTML**: Use proper HTML5 elements
- ✅ **ARIA labels**: All interactive elements must have labels
- ✅ **Keyboard navigation**: Tab, Enter, Space, Arrow keys
- ✅ **Color contrast**: >= 4.5:1 for text
- ✅ **Focus indicators**: Visible focus states
- ✅ **Screen reader support**: Proper announcements
- ✅ **Form validation**: Clear error messages
- ✅ **Heading hierarchy**: Logical heading levels

### Testing Checklist

Before submitting a PR, verify:

- [ ] Keyboard navigation works (Tab, Shift+Tab, Enter, Space)
- [ ] Screen reader announces all content correctly
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Focus indicators are visible
- [ ] jest-axe tests pass
- [ ] Form labels are associated with inputs
- [ ] Error messages are announced
- [ ] Loading states are announced

---

## Pull Request Process

### Before Submitting

1. **Run all tests**: `npm test`
2. **Run linter**: `npm run lint`
3. **Check types**: `npm run type-check`
4. **Test manually**: Try your changes in a real app
5. **Update docs**: README, CHANGELOG, etc.
6. **Add tests**: Cover new functionality

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested your changes

## Accessibility
- [ ] Keyboard navigation tested
- [ ] Screen reader tested
- [ ] jest-axe tests pass
- [ ] Color contrast verified

## Checklist
- [ ] Tests pass
- [ ] Linter passes
- [ ] Types check
- [ ] Documentation updated
- [ ] CHANGELOG updated
```

### Review Process

1. **Automated checks**: CI runs tests, linting, type checking
2. **Code review**: Maintainer reviews code quality
3. **Accessibility review**: Verify WCAG compliance
4. **Design review**: Verify UI matches design system
5. **Approval**: At least one maintainer approval required

### After Merge

- Your PR will be included in the next release
- You'll be credited in the CHANGELOG
- Thank you for contributing! 🎉

---

## Release Process

Releases are managed by maintainers using semantic versioning:

- **Patch (0.1.x)**: Bug fixes, documentation updates
- **Minor (0.x.0)**: New features, backwards compatible
- **Major (x.0.0)**: Breaking changes

### Release Checklist (Maintainers)

1. Update CHANGELOG.md with release notes
2. Update package.json version
3. Run `npm run build` to create production build
4. Run `npm test` to verify all tests pass
5. Create git tag: `git tag v0.1.0`
6. Push tag: `git push origin v0.1.0`
7. Publish to npm: `npm publish`
8. Create GitHub release with notes

---

## Questions?

- **Discord**: [https://discord.gg/molam](https://discord.gg/molam)
- **GitHub Discussions**: [https://github.com/molam/ui/discussions](https://github.com/molam/ui/discussions)
- **Email**: dev@molam.co

Thank you for contributing to Molam UI! 🙏
