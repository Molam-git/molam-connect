/**
 * ESLint configuration for @molam/ui
 * Includes React, TypeScript, and accessibility rules
 */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    es2020: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended', // Accessibility rules
  ],
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
    'jsx-a11y',
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // TypeScript
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    // React
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/prop-types': 'off', // Using TypeScript for prop validation
    'react/display-name': 'off',

    // React Hooks
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Accessibility (jsx-a11y)
    'jsx-a11y/anchor-is-valid': 'warn',
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/label-has-associated-control': ['error', {
      required: {
        some: ['nesting', 'id'],
      },
    }],

    // General
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'warn',
    'no-unused-vars': 'off', // Handled by TypeScript
  },
  overrides: [
    {
      // Disable some rules for test files
      files: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
      },
    },
  ],
};
