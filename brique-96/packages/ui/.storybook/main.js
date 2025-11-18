/**
 * Storybook main configuration
 * https://storybook.js.org/docs/react/configure/overview
 */

module.exports = {
  stories: [
    '../src/**/*.stories.mdx',
    '../src/**/*.stories.@(js|jsx|ts|tsx)',
  ],

  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y', // Accessibility addon
  ],

  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },

  docs: {
    autodocs: true,
  },

  staticDirs: ['../public'],

  // TypeScript configuration
  typescript: {
    check: false, // Disable type checking in Storybook (use tsc separately)
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => {
        // Include props from node_modules except react
        if (prop.parent) {
          return !prop.parent.fileName.includes('node_modules/@types/react');
        }
        return true;
      },
    },
  },

  // Webpack configuration
  webpackFinal: async (config) => {
    // Add support for importing CSS
    config.module.rules.push({
      test: /\.css$/,
      use: ['style-loader', 'css-loader', 'postcss-loader'],
    });

    return config;
  },
};
