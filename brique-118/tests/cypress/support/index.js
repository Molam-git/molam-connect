/**
 * Brique 118: Cypress Support File
 * Custom commands and global configuration
 */

// Import Cypress commands
import './commands';

// Global configuration
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent Cypress from failing tests on uncaught exceptions
  // This is useful for third-party scripts that might throw errors
  console.error('Uncaught exception:', err.message);
  return false;
});

// Before each test
beforeEach(() => {
  // Clear cookies and local storage
  cy.clearCookies();
  cy.clearLocalStorage();

  // Set default viewport
  cy.viewport(1280, 720);
});

// Custom assertions
chai.use((chai, utils) => {
  // Add custom assertion for UUID format
  chai.Assertion.addMethod('uuid', function () {
    const obj = this._obj;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    this.assert(
      uuidRegex.test(obj),
      'expected #{this} to be a valid UUID',
      'expected #{this} not to be a valid UUID'
    );
  });

  // Add custom assertion for ISO timestamp
  chai.Assertion.addMethod('isoTimestamp', function () {
    const obj = this._obj;
    const date = new Date(obj);

    this.assert(
      !isNaN(date.getTime()) && date.toISOString() === obj,
      'expected #{this} to be a valid ISO timestamp',
      'expected #{this} not to be a valid ISO timestamp'
    );
  });
});

// Global test utilities
Cypress.Commands.add('waitForPlayground', () => {
  cy.get('[data-testid="request-editor"]', { timeout: 10000 }).should('exist');
});

Cypress.Commands.add('fillPaymentRequest', (amount = 5000, currency = 'XOF') => {
  cy.get('[data-testid="method-select"]').select('POST');
  cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
  cy.get('[data-testid="body-editor"]').clear().type(
    JSON.stringify({ amount, currency, method: 'wallet' }),
    { parseSpecialCharSequences: false }
  );
});

Cypress.Commands.add('executeRequest', () => {
  cy.get('[data-testid="run-button"]').click();
  cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
});

Cypress.Commands.add('saveSession', () => {
  cy.get('[data-testid="save-button"]').click();
  cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');
});

Cypress.Commands.add('shareSession', () => {
  cy.get('[data-testid="share-button"]').click();
  cy.get('[data-testid="share-link"]', { timeout: 5000 }).should('be.visible');
});
