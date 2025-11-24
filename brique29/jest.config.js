module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testTimeout: 20000,
    setupFilesAfterEnv: ['./tests/setupJest.ts'],
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/start.ts'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html']
};