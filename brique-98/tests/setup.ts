/**
 * Brique 98 — Jest Test Setup
 *
 * Global test configuration and mocks
 */

// Mock environment variables
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_DB = 'molam_offline_test';
process.env.POSTGRES_USER = 'molam';
process.env.POSTGRES_PASSWORD = 'test_password';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.USE_REAL_KMS = 'false';
process.env.MOCK_KMS_PASSWORD = 'test-kms-password';
process.env.ENABLE_SIRA_SCORING = 'false';

// Increase timeout for crypto operations
jest.setTimeout(10000);

// Mock KMS functions for testing
jest.mock('../src/offline/security', () => {
  const actual = jest.requireActual('../src/offline/security');
  return {
    ...actual,
    // Mock KMS functions to use simple encryption for testing
    // (actual implementation imports from brique-97)
  };
});

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
