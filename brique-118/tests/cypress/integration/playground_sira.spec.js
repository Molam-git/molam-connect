/**
 * Brique 118: Playground E2E Test - Sira Suggestions
 * Test les suggestions intelligentes de Sira
 */

describe('Playground - Sira Suggestions', () => {
  beforeEach(() => {
    cy.visit('http://localhost:8082/playground');
    cy.wait(500);
  });

  it('should show Sira suggestion for missing Idempotency-Key', () => {
    // POST request without Idempotency-Key
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    const requestBody = {
      amount: 5000,
      currency: 'XOF'
    };

    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();

    // Verify Sira suggestion appears
    cy.get('[data-testid="sira-suggestions"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="sira-suggestions"]').should('contain', 'Idempotency-Key');
    cy.get('[data-testid="suggestion-missing_idempotency"]').should('exist');
  });

  it('should NOT show idempotency suggestion when header is present', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    // Add Idempotency-Key header
    cy.get('[data-testid="headers-section"]').click();
    cy.get('[data-testid="add-header-button"]').click();
    cy.get('[data-testid="header-key-0"]').type('Idempotency-Key');
    cy.get('[data-testid="header-value-0"]').type('test-key-12345');

    const requestBody = {
      amount: 5000,
      currency: 'XOF'
    };

    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();

    // Verify NO idempotency suggestion
    cy.get('[data-testid="sira-suggestions"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="suggestion-missing_idempotency"]').should('not.exist');
  });

  it('should show suggestion for invalid method', () => {
    // Try DELETE on endpoint that doesn't support it
    cy.get('[data-testid="method-select"]').select('DELETE');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="sira-suggestions"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="sira-suggestions"]').should('contain', 'méthode');
  });

  it('should show suggestion for missing path', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear();
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="sira-suggestions"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="suggestion-missing_path"]').should('exist');
  });

  it('should display Sira confidence score', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    const requestBody = { amount: 5000, currency: 'XOF' };
    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();

    // Check for confidence score in suggestions
    cy.get('[data-testid="sira-suggestions"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="sira-confidence"]').should('exist');
    cy.get('[data-testid="sira-confidence"]').invoke('text').should('match', /\d+%/);
  });

  it('should allow dismissing Sira suggestions', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="sira-suggestions"]', { timeout: 10000 }).should('be.visible');

    // Dismiss suggestion
    cy.get('[data-testid="dismiss-suggestion"]').first().click();

    // Verify suggestion is removed
    cy.get('[data-testid="suggestion-missing_idempotency"]').should('not.exist');
  });

  it('should show multiple suggestions when applicable', () => {
    // POST with no path, no headers, empty body
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear();
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="sira-suggestions"]', { timeout: 10000 }).should('be.visible');

    // Should have at least 2 suggestions
    cy.get('[data-testid^="suggestion-"]').should('have.length.at.least', 2);
  });

  it('should categorize suggestions by severity', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="sira-suggestions"]', { timeout: 10000 }).should('be.visible');

    // Check for severity indicators
    cy.get('[data-testid="suggestion-severity-warning"]').should('exist');
  });
});
