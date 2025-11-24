import dotenv from 'dotenv';

// Charger les variables d'environnement de test
dotenv.config({ path: '.env.test' });

// Configuration globale pour les tests
process.env.NODE_ENV = 'test';

// Mock pour la base de données
jest.mock('../src/db', () => ({
    pool: {
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
    },
}));

// Nettoyage après chaque test
afterEach(() => {
    jest.clearAllMocks();
});

// Timeout global pour les tests
jest.setTimeout(10000);

// Variables globales pour les tests
(global as any).__TEST__ = true;