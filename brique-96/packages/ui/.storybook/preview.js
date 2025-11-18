/**
 * Storybook preview configuration
 * https://storybook.js.org/docs/react/configure/overview#configure-story-rendering
 */

import '../styles/index.css';

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  backgrounds: {
    default: 'light',
    values: [
      {
        name: 'light',
        value: '#ffffff',
      },
      {
        name: 'dark',
        value: '#000000',
      },
      {
        name: 'gray',
        value: '#f3f4f6',
      },
    ],
  },
  // Accessibility addon configuration
  a11y: {
    element: '#root',
    config: {
      rules: [
        {
          id: 'color-contrast',
          enabled: true,
        },
        {
          id: 'label',
          enabled: true,
        },
        {
          id: 'aria-valid-attr-value',
          enabled: true,
        },
      ],
    },
  },
};

// Global decorators
export const decorators = [
  (Story) => (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <Story />
    </div>
  ),
];
