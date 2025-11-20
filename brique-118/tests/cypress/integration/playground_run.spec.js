/**
 * Brique 118: Playground E2E Test - Run API Request
 * Test l'exécution de requêtes dans le playground
 */

describe('Playground - Run API Request', () => {
  beforeEach(() => {
    cy.visit('http://localhost:8082/playground');
    cy.wait(500);
  });

  it('should load playground page', () => {
    cy.contains('API Playground').should('be.visible');
    cy.get('[data-testid="request-editor"]').should('exist');
  });

  it('should execute POST /v1/payments successfully', () => {
    // Configure request
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    const requestBody = {
      amount: 5000,
      currency: 'XOF',
      method: 'wallet'
    };

    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });

    // Execute
    cy.get('[data-testid="run-button"]').click();

    // Verify response
    cy.get('[data-testid="response-section"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="response-status"]').should('contain', '200');
    cy.get('[data-testid="response-body"]').should('contain', 'pay_test_');
    cy.get('[data-testid="response-body"]').should('contain', 'succeeded');
    cy.get('[data-testid="response-body"]').should('contain', '5000');
  });

  it('should execute GET /v1/payments/:id successfully', () => {
    cy.get('[data-testid="method-select"]').select('GET');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments/pay_123456789');

    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('contain', '200');
    cy.get('[data-testid="response-body"]').should('contain', 'pay_123456789');
  });

  it('should execute POST /v1/refunds successfully', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/refunds');

    const requestBody = {
      payment_id: 'pay_123456789',
      amount: 5000
    };

    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('contain', '200');
    cy.get('[data-testid="response-body"]').should('contain', 'ref_test_');
    cy.get('[data-testid="response-body"]').should('contain', 'succeeded');
  });

  it('should handle empty request gracefully', () => {
    cy.get('[data-testid="run-button"]').click();

    // Should show validation error or default behavior
    cy.get('[data-testid="error-message"]', { timeout: 5000 }).should('be.visible');
  });

  it('should display request/response timing', () => {
    cy.get('[data-testid="method-select"]').select('GET');
    cy.get('[data-testid="path-input"]').clear().type('/healthz');
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="response-time"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="response-time"]').should('match', /\d+ms/);
  });

  it('should persist request across page refresh', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    cy.reload();
    cy.wait(500);

    // Check if request is persisted (if feature exists)
    cy.get('[data-testid="path-input"]').should('have.value', '/v1/payments');
  });
});
