// tests/setup.ts
// Configuration globale pour les tests
import { TextEncoder, TextDecoder } from 'util';

// Polyfill pour Node.js
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Augmenter le timeout pour les tests d'intégration
jest.setTimeout(30000);