/**
 * Brique 118: Cypress Custom Commands
 * Reusable commands for E2E tests
 */

// Login command (if authentication is needed)
Cypress.Commands.add('login', (email = 'test@molam.com', password = 'testpass123') => {
  cy.visit('/login');
  cy.get('[data-testid="email-input"]').type(email);
  cy.get('[data-testid="password-input"]').type(password);
  cy.get('[data-testid="login-button"]').click();
  cy.url().should('include', '/playground');
});

// API request helper
Cypress.Commands.add('apiRequest', (method, path, body = null, headers = {}) => {
  const baseUrl = Cypress.env('API_BASE_URL') || 'http://localhost:8082/api';

  return cy.request({
    method,
    url: `${baseUrl}${path}`,
    body,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    failOnStatusCode: false
  });
});

// Create test session via API
Cypress.Commands.add('createTestSession', (requestData) => {
  return cy.apiRequest('POST', '/playground/run', requestData).then((response) => {
    return response.body;
  });
});

// Wait for mock sandbox
Cypress.Commands.add('waitForMockSandbox', () => {
  const sandboxUrl = Cypress.env('MOCK_SANDBOX_URL') || 'http://localhost:4001';

  cy.request({
    url: `${sandboxUrl}/healthz`,
    retryOnStatusCodeFailure: true,
    timeout: 30000
  }).then((response) => {
    expect(response.status).to.eq(200);
    expect(response.body.ok).to.be.true;
  });
});

// Clear all playground sessions
Cypress.Commands.add('clearPlaygroundSessions', () => {
  cy.apiRequest('DELETE', '/playground/sessions/all');
});

// Get share link from session
Cypress.Commands.add('getShareLink', (sessionId) => {
  return cy.apiRequest('POST', '/playground/share', { sessionId }).then((response) => {
    return response.body.url;
  });
});

// Verify Sira suggestion exists
Cypress.Commands.add('verifySiraSuggestion', (suggestionCode) => {
  cy.get('[data-testid="sira-suggestions"]').should('be.visible');
  cy.get(`[data-testid="suggestion-${suggestionCode}"]`).should('exist');
});

// Verify Sira suggestion does not exist
Cypress.Commands.add('verifySiraSuggestionNotExists', (suggestionCode) => {
  cy.get(`[data-testid="suggestion-${suggestionCode}"]`).should('not.exist');
});

// Check response contains payment ID
Cypress.Commands.add('verifyPaymentResponse', () => {
  cy.get('[data-testid="response-body"]').should('contain', 'pay_test_');
  cy.get('[data-testid="response-body"]').should('contain', 'succeeded');
});

// Check response contains refund ID
Cypress.Commands.add('verifyRefundResponse', () => {
  cy.get('[data-testid="response-body"]').should('contain', 'ref_test_');
  cy.get('[data-testid="response-body"]').should('contain', 'succeeded');
});

// Intercept API calls
Cypress.Commands.add('interceptPlaygroundRun', () => {
  cy.intercept('POST', '/api/playground/run').as('playgroundRun');
});

Cypress.Commands.add('interceptPlaygroundSave', () => {
  cy.intercept('POST', '/api/playground/save').as('playgroundSave');
});

Cypress.Commands.add('interceptPlaygroundShare', () => {
  cy.intercept('POST', '/api/playground/share').as('playgroundShare');
});

// Wait for intercepted API calls
Cypress.Commands.add('waitForPlaygroundRun', () => {
  cy.wait('@playgroundRun', { timeout: 10000 });
});

Cypress.Commands.add('waitForPlaygroundSave', () => {
  cy.wait('@playgroundSave', { timeout: 5000 });
});

Cypress.Commands.add('waitForPlaygroundShare', () => {
  cy.wait('@playgroundShare', { timeout: 5000 });
});
