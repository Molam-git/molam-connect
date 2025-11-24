module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: [
        '**/__tests__/**/*.+(ts|tsx|js)',
        '**/?(*.)+(spec|test).+(ts|tsx|js)'
    ],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    moduleNameMapping: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@db/(.*)$': '<rootDir>/src/db/$1',
        '^@routes/(.*)$': '<rootDir>/src/routes/$1',
        '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
        '^@services/(.*)$': '<rootDir>/src/services/$1',
        '^@types/(.*)$': '<rootDir>/src/types/$1'
    },
    collectCoverageFrom: [
        'src/**/*.{ts,js}',
        '!src/**/*.d.ts',
        '!src/index.ts',
        '!src/db/migrations/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',
        'lcov',
        'html'
    ]
};