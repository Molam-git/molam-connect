/**
 * Brique 98 — Jest Configuration
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/server.ts',
  ],
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react',
      },
    },
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testTimeout: 10000,
};
