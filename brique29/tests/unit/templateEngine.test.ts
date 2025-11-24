import { renderTemplate, validateTemplateVariables } from '../../src/utils/templateEngine';

describe('Template Engine', () => {
    test('should render template with valid variables', () => {
        const template = 'Hello ${user_name}, your balance is ${amount} ${currency}';
        const variables = { user_name: 'John', amount: 1000, currency: 'XOF' };
        const result = renderTemplate(template, variables);
        expect(result).toBe('Hello John, your balance is 1000 XOF');
    });

    test('should leave unknown variables as-is', () => {
        const template = 'Hello ${user_name}, unknown ${invalid_var}';
        const variables = { user_name: 'John' };
        const result = renderTemplate(template, variables);
        expect(result).toBe('Hello John, unknown ${invalid_var}');
    });

    test('should validate template variables', () => {
        const template = 'Hello ${user_name}, invalid ${unknown_var}';
        const invalidVars = validateTemplateVariables(template);
        expect(invalidVars).toEqual(['unknown_var']);
    });
});