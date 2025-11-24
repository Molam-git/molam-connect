// jest.config.js
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/index.ts',
        '!src/**/*.d.ts',
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};