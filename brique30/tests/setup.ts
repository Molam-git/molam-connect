import { pool } from '../src/db';

// Mock global de la base de données
jest.mock('../src/db', () => ({
    pool: {
        query: jest.fn(),
    },
}));

// Augmenter le timeout pour les tests
jest.setTimeout(10000);