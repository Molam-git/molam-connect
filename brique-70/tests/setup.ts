// Test setup file
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/molam_marketing_test';
  process.env.SIRA_ENABLED = 'false'; // Disable SIRA in tests
});

afterAll(() => {
  // Cleanup
});
