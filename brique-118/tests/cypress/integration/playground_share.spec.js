/**
 * Brique 118: Playground E2E Test - Share Functionality
 * Test le partage de sessions via liens publics
 */

describe('Playground - Share Functionality', () => {
  beforeEach(() => {
    cy.visit('http://localhost:8082/playground');
    cy.wait(500);
  });

  it('should generate share link', () => {
    // Execute and save a request
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    const requestBody = {
      amount: 5000,
      currency: 'XOF',
      method: 'wallet'
    };

    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();

    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');

    // Save first
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');

    // Click Share button
    cy.get('[data-testid="share-button"]').click();

    // Verify share link is generated
    cy.get('[data-testid="share-link"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="share-link"]').should('contain', 'http');
    cy.get('[data-testid="share-link"]').should('contain', '/playground/');
  });

  it('should copy share link to clipboard', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');

    // Generate and copy share link
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-link"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="copy-share-link"]').click();

    // Verify copy confirmation
    cy.get('[data-testid="copy-share-confirmation"]').should('be.visible');
    cy.get('[data-testid="copy-share-confirmation"]').should('contain', 'Lien copié');
  });

  it('should open shared session via public link', () => {
    // Create and share a session
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/refunds');

    const requestBody = {
      payment_id: 'pay_shared_test',
      amount: 3000
    };

    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="share-button"]').click();

    // Get share link
    cy.get('[data-testid="share-link"]', { timeout: 5000 }).invoke('text').then((shareUrl) => {
      // Extract share key from URL
      const shareKey = shareUrl.split('/playground/')[1];

      // Visit public link (new session, no auth)
      cy.visit(`http://localhost:8082/playground/${shareKey}`);
      cy.wait(1000);

      // Verify session loaded
      cy.get('[data-testid="path-input"]').should('have.value', '/v1/refunds');
      cy.get('[data-testid="body-editor"]').should('contain', 'pay_shared_test');
      cy.get('[data-testid="body-editor"]').should('contain', '3000');
    });
  });

  it('should show read-only mode for shared sessions', () => {
    // Create and share
    cy.get('[data-testid="method-select"]').select('GET');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments/pay_123');
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="share-button"]').click();

    cy.get('[data-testid="share-link"]', { timeout: 5000 }).invoke('text').then((shareUrl) => {
      const shareKey = shareUrl.split('/playground/')[1];

      // Visit as public viewer
      cy.visit(`http://localhost:8082/playground/${shareKey}`);
      cy.wait(1000);

      // Check for read-only indicator
      cy.get('[data-testid="read-only-badge"]').should('be.visible');
      cy.get('[data-testid="read-only-badge"]').should('contain', 'Lecture seule');
    });
  });

  it('should allow running request from shared session', () => {
    // Create and share
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');

    const requestBody = { amount: 1000, currency: 'EUR' };
    cy.get('[data-testid="body-editor"]').clear().type(JSON.stringify(requestBody), { parseSpecialCharSequences: false });
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="share-button"]').click();

    cy.get('[data-testid="share-link"]', { timeout: 5000 }).invoke('text').then((shareUrl) => {
      const shareKey = shareUrl.split('/playground/')[1];
      cy.visit(`http://localhost:8082/playground/${shareKey}`);
      cy.wait(1000);

      // Run request from shared session
      cy.get('[data-testid="run-button"]').click();

      // Verify response
      cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
      cy.get('[data-testid="response-body"]').should('contain', 'pay_test_');
    });
  });

  it('should NOT allow editing shared session', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="share-button"]').click();

    cy.get('[data-testid="share-link"]', { timeout: 5000 }).invoke('text').then((shareUrl) => {
      const shareKey = shareUrl.split('/playground/')[1];
      cy.visit(`http://localhost:8082/playground/${shareKey}`);
      cy.wait(1000);

      // Save button should be disabled or hidden
      cy.get('[data-testid="save-button"]').should('be.disabled');
    });
  });

  it('should display shared session metadata', () => {
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="share-button"]').click();

    cy.get('[data-testid="share-link"]', { timeout: 5000 }).invoke('text').then((shareUrl) => {
      const shareKey = shareUrl.split('/playground/')[1];
      cy.visit(`http://localhost:8082/playground/${shareKey}`);
      cy.wait(1000);

      // Check metadata display
      cy.get('[data-testid="session-metadata"]').should('be.visible');
      cy.get('[data-testid="session-created-at"]').should('exist');
      cy.get('[data-testid="session-method"]').should('contain', 'POST');
    });
  });

  it('should handle invalid share key gracefully', () => {
    cy.visit('http://localhost:8082/playground/invalid_share_key_xyz');
    cy.wait(1000);

    // Should show error message
    cy.get('[data-testid="share-error"]').should('be.visible');
    cy.get('[data-testid="share-error"]').should('contain', 'Session introuvable');
  });

  it('should revoke share link', () => {
    // Create and share
    cy.get('[data-testid="method-select"]').select('POST');
    cy.get('[data-testid="path-input"]').clear().type('/v1/payments');
    cy.get('[data-testid="run-button"]').click();
    cy.get('[data-testid="response-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').click();
    cy.get('[data-testid="save-confirmation"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="share-button"]').click();

    cy.get('[data-testid="share-link"]', { timeout: 5000 }).invoke('text').then((shareUrl) => {
      const shareKey = shareUrl.split('/playground/')[1];

      // Revoke share
      cy.get('[data-testid="revoke-share"]').click();
      cy.get('[data-testid="confirm-revoke"]').click();
      cy.get('[data-testid="revoke-confirmation"]').should('be.visible');

      // Try accessing revoked link
      cy.visit(`http://localhost:8082/playground/${shareKey}`);
      cy.wait(1000);

      cy.get('[data-testid="share-error"]').should('be.visible');
      cy.get('[data-testid="share-error"]').should('contain', 'révoquée');
    });
  });
});
