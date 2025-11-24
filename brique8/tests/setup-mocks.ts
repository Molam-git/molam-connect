// Configuration globale des mocks pour tous les tests
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

process.env.NODE_ENV = 'test';

// Désactiver les logs en console pendant les tests
console.log = jest.fn();
console.error = jest.fn();
console.warn = jest.fn();

jest.setTimeout(10000);