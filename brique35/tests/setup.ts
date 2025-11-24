// Configuration globale pour les tests
import { pool } from '../src/db';

// Augmenter le timeout pour les tests
jest.setTimeout(10000);

// Nettoyage après les tests
afterAll(async () => {
    await pool.end();
});