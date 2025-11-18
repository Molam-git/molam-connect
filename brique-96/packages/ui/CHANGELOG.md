# Changelog

All notable changes to `@molam/ui` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-14

### Added

#### Core Components
- **CheckoutInline**: Main checkout component with Apple-like minimal design
- **WalletInline**: Molam Wallet payment method with Molam ID integration
- **CardInline**: Card payment with PCI-compliant hosted fields
- **BankInline**: Bank transfer payment with IBAN support
- **QRInline**: QR code payment with dynamic generation and expiration
- **USSDInline**: USSD payment with country-specific provider support

#### Type System
- Complete TypeScript type definitions for all components
- `PaymentPayload` and `PaymentResult` interfaces
- `SiraHints` interface for AI routing
- `UserPrefill` interface for Molam ID integration
- `CheckoutConfig` interface for advanced configuration
- `TelemetryEvent` interface for event tracking

#### Utilities
- **currency.ts**: Multi-currency formatting with Intl API (150+ currencies)
- **locale.ts**: Multi-language support (English, French, Wolof)
- **network.ts**: Network detection and offline fallback
- **hosted-fields.ts**: PCI-compliant iframe management for card tokenization

#### Styling
- Complete CSS design token system with CSS variables
- Light and dark theme support
- Custom theme support via theme prop
- Apple-like minimal design with subtle animations
- Responsive layouts for mobile and desktop
- High contrast mode support
- Reduced motion support

#### Accessibility (A11Y)
- WCAG AA compliance
- Complete ARIA labels and roles
- Keyboard navigation support (Tab, Enter, Space, Arrow keys)
- Screen reader support (NVDA, JAWS, VoiceOver, TalkBack)
- Live regions for dynamic announcements
- Focus management
- Color contrast >= 4.5:1
- Semantic HTML (fieldset, legend, header, footer)

#### Testing
- Comprehensive unit tests with Jest and Testing Library
- Accessibility tests with jest-axe
- 70%+ code coverage threshold
- Test utilities and mocks

#### Documentation
- Complete README with API reference
- Integration guide with backend examples
- Changelog
- Contributing guidelines
- Example integrations (8 examples)

#### Features
- **SIRA AI Integration**: Smart payment method recommendations
- **Molam ID Integration**: User prefill and authentication
- **Offline Support**: QR and USSD fallback when network unavailable
- **Network Detection**: Automatic quality assessment
- **Telemetry**: Event tracking for all UX interactions
- **Progressive Disclosure**: Show/hide payment methods
- **Multi-currency**: Support for 150+ currencies with proper formatting
- **Multi-language**: English, French, Wolof translations
- **PCI Compliance**: Hosted fields for secure card tokenization
- **Idempotency**: Duplicate payment prevention
- **Error Handling**: Graceful error messages and recovery
- **Loading States**: Visual feedback during payment processing

#### Build System
- Rollup configuration for ESM and CJS builds
- TypeScript declaration generation
- Tree-shakeable exports
- Source maps for debugging
- PostCSS for CSS processing
- Terser for production minification

#### Developer Experience
- ESLint configuration with accessibility rules
- Jest configuration with jsdom environment
- Storybook support (configuration ready)
- Hot module replacement support
- TypeScript strict mode enabled

### Security
- PCI DSS compliance via hosted fields
- No raw card data in merchant memory
- Iframe sandbox attributes
- PostMessage origin validation
- Content Security Policy compatible
- XSS protection

### Performance
- Bundle size: ~45KB (minified + gzipped)
- Tree-shakeable imports
- Lazy loading support
- CSS-in-JS avoided (external CSS)
- Minimal runtime dependencies
- Optimized re-renders with React.memo

---

## [Unreleased]

### Planned Features
- **Storybook Documentation**: Interactive component documentation
- **More Payment Methods**: Mobile money providers, crypto wallets
- **More Languages**: Arabic, Portuguese, Spanish
- **More Themes**: High contrast, larger text options
- **Enhanced Telemetry**: Conversion funnel tracking
- **A/B Testing**: Built-in experiment support
- **Enhanced Fraud Detection**: Client-side signals for SIRA
- **Recurring Payments**: Subscription and saved payment methods
- **Split Payments**: Multi-party payment support
- **Gift Cards**: Molam gift card integration

### Future Improvements
- Reduce bundle size to <40KB
- Add animation options (spring, fade, slide)
- Add custom field validation
- Add webhook status polling
- Add payment history widget
- Add receipt generation

---

## Migration Guides

### From Beta to v0.1.0

If you were using an earlier beta version, here are the breaking changes:

#### Breaking Changes
- None (initial release)

#### Deprecations
- None (initial release)

---

## Release Notes

### v0.1.0 - Initial Release

This is the first public release of `@molam/ui`. It provides a complete, production-ready React component library for integrating Molam payments into web applications.

**Highlights**:
- Apple-like minimal design with smooth animations
- Complete WCAG AA accessibility compliance
- Support for 5 payment methods (wallet, card, bank, QR, USSD)
- Multi-language (English, French, Wolof)
- Multi-currency (150+ currencies)
- SIRA AI integration for smart routing
- Molam ID integration for user prefill
- PCI-compliant hosted fields for card payments
- Offline support with QR/USSD fallback
- Comprehensive testing with 70%+ coverage
- Complete TypeScript support

**What's New**:
- Everything! This is the initial release.

**Known Issues**:
- None currently reported

**Browser Support**:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- iOS Safari 14+
- Android Chrome 90+

**Node.js Support**:
- Node.js 16.x or higher
- React 18.0.0 or higher

---

## Support

For questions, issues, or feature requests:
- **GitHub Issues**: [https://github.com/molam/ui/issues](https://github.com/molam/ui/issues)
- **Discord**: [https://discord.gg/molam](https://discord.gg/molam)
- **Email**: support@molam.co
