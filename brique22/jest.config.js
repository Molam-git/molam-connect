module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/index.ts',
        '!src/**/*.d.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    moduleNameMapping: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@contracts/(.*)$': '<rootDir>/src/contracts/$1',
        '^@services/(.*)$': '<rootDir>/src/services/$1',
        '^@utils/(.*)$': '<rootDir>/src/utils/$1',
        '^@http/(.*)$': '<rootDir>/src/http/$1',
    },
    // Configuration pour les types globaux de Jest
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.json'
        }
    }
};