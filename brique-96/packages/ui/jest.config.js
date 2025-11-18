/**
 * Jest configuration for @molam/ui
 * Includes accessibility testing with jest-axe
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Module paths
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Transform files
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },

  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.test.(ts|tsx)',
    '**/?(*.)+(spec|test).(ts|tsx)',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/examples/**',
    '!src/index.ts',
  ],

  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/examples/',
  ],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Globals
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
