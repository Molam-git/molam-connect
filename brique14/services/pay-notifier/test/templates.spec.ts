import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../src/core/templates.js';
import { interpolate } from '../src/core/templates.js';

describe('Template Engine', () => {
    describe('interpolate', () => {
        it('should replace variables in template', () => {
            const template = 'Hello {{name}}, you have {{amount}} {{currency}}';
            const variables = { name: 'John', amount: 100, currency: 'USD' };
            const result = interpolate(template, variables);
            expect(result).toBe('Hello John, you have 100 USD');
        });

        it('should handle missing variables', () => {
            const template = 'Hello {{name}}, you have {{amount}}';
            const variables = { name: 'John' };
            const result = interpolate(template, variables);
            expect(result).toBe('Hello John, you have ');
        });

        it('should handle nested variables', () => {
            const template = 'Transaction {{tx.id}} for {{user.name}}';
            const variables = { tx: { id: '123' }, user: { name: 'John' } };
            const result = interpolate(template, variables);
            expect(result).toBe('Transaction 123 for John');
        });
    });

    // More tests would be added for template rendering, SIRA, etc.
});