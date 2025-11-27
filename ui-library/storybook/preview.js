import '../src/theme/tokens.css';

/** @type { import('@storybook/react').Preview } */
const preview = {
  parameters: {
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
          value: '#0b1220',
        },
      ],
    },
  },
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || 'light';

      // Update document theme
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme);

        // Update background color
        if (theme === 'dark') {
          document.body.style.backgroundColor = '#0b1220';
          document.body.style.color = '#e6eef8';
        } else {
          document.body.style.backgroundColor = '#ffffff';
          document.body.style.color = '#0b1220';
        }
      }

      return <Story />;
    },
  ],
};

export default preview;
