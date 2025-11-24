module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/index.ts',
    '!src/config/database.ts', // Exclure la config DB des tests mockés
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup-mocks.ts'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  },
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};