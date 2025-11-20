/**
 * Brique 118: Playground E2E Test - Snippet Generation & Save
 * Test la génération de code et la sauvegarde de sessions
 */

describe('Playground - Snippet Generation & Save', () => {
  beforeEach(() => {
    cy.visit('http://localhost:8082/playground');
    cy.wait(500);
  });

  it('should generate Node.js snippet', () => {
    // Execute a request first
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    const requestBody = {
      amount: 5000,
      currency: 'XOF',
      method: 'wallet'
    };

    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();

    // Wait for response
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');

    // Switch to Code Snippets tab
    cy.get('[data-testid="tab-snippets"]').click();

    // Select Node.js
    cy.get('[data-testid="snippet-lang-node"]').click();

    // Verify snippet content
    cy.get('[data-testid="snippet-content"]').should('be.visible');
    cy.get('[data-testid="snippet-content"]').should('contain', 'const molam');
    cy.get('[data-testid="snippet-content"]').should('contain', 'payments.create');
    cy.get('[data-testid="snippet-content"]').should('contain', '5000');
    cy.get('[data-testid="snippet-content"]').should('contain', 'XOF');
  });

  it('should generate PHP snippet', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/refunds');

    const requestBody = {
      payment_id: 'pay_123',
      amount: 2500
    };

    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="tab-snippets"]').click();
    cy.get('[data-testid="snippet-lang-php"]').click();

    cy.get('[data-testid="snippet-content"]').should('contain', '$molam');
    cy.get('[data-testid="snippet-content"]').should('contain', 'refunds->create');
    cy.get('[data-testid="snippet-content"]').should('contain', '2500');
  });

  it('should generate Python snippet', () => {
    cy.get('[data-testid="method-select"]').select('GET');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments/pay_123');
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="tab-snippets"]').click();
    cy.get('[data-testid="snippet-lang-python"]').click();

    cy.get('[data-testid="snippet-content"]').should('contain', 'import molam');
    cy.get('[data-testid="snippet-content"]').should('contain', 'payments.retrieve');
  });

  it('should generate cURL snippet', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    const requestBody = { amount: 5000, currency: 'XOF' };
    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="tab-snippets"]').click();
    cy.get('[data-testid="snippet-lang-curl"]').click();

    cy.get('[data-testid="snippet-content"]').should('contain', 'curl');
    cy.get('[data-testid="snippet-content"]').should('contain', '-X POST');
    cy.get('[data-testid="snippet-content"]').should('contain', '/v1/payments');
  });

  it('should copy snippet to clipboard', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="tab-snippets"]').click();
    cy.get('[data-testid="snippet-lang-node"]').click();

    cy.get('[data-testid="copy-snippet-button"]').click();

    // Verify copy confirmation
    cy.get('[data-testid="copy-confirmation"]').should('be.visible');
    cy.get('[data-testid="copy-confirmation"]').should('contain', 'Copié');
  });

  it('should save session successfully', () => {
    // Execute a request
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    const requestBody = { amount: 5000, currency: 'XOF' };
    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');

    // Click Save button
    cy.get('[data-testid="save-button"]').click();

    // Verify save confirmation
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="save-confirmation"]').should('contain', 'Session sauvegardée');
  });

  it('should load saved session', () => {
    // First, save a session
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');

    // Get session ID from URL or UI
    cy.url().then((url) => {
      const sessionId = url.split('session=')[1];

      // Navigate away
      cy.visit('http://localhost:8082/playground');
      cy.wait(500);

      // Load saved session
      cy.get('[data-testid="my-sessions-button"]').click();
      cy.get(`[data-testid="session-${sessionId}"]`).click();

      // Verify session loaded
      cy.get('[data-testid="path-input"]').should('have.value', '/v1/payments');
    });
  });

  it('should display session history', () => {
    // Save a session first
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');

    // Open session history
    cy.get('[data-testid="my-sessions-button"]').click();

    // Verify session appears in list
    cy.get('[data-testid="sessions-list"]').should('be.visible');
    cy.get('[data-testid^="session-"]').should('have.length.at.least', 1);
  });

  it('should delete saved session', () => {
    // Save a session
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');

    // Open sessions and delete
    cy.get('[data-testid="my-sessions-button"]').click();
    cy.get('[data-testid^="session-"]').first().find('[data-testid="delete-session"]').click();

    // Confirm deletion
    cy.get('[data-testid="confirm-delete"]').click();

    // Verify deletion confirmation
    cy.get('[data-testid="delete-confirmation"]').should('be.visible');
  });
});
