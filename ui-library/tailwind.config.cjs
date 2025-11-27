/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./storybook/**/*.{js,jsx,ts,tsx}"
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        molam: {
          primary: 'var(--molam-primary)',
          'on-primary': 'var(--molam-on-primary)',
          bg: 'var(--molam-bg)',
          surface: 'var(--molam-surface)',
          text: 'var(--molam-text)',
          'text-secondary': 'var(--molam-text-secondary)',
          border: 'var(--molam-border)',
          success: 'var(--molam-success)',
          warning: 'var(--molam-warning)',
          error: 'var(--molam-error)',
          info: 'var(--molam-info)'
        }
      },
      borderRadius: {
        'molam': 'var(--molam-radius)',
        'molam-lg': 'var(--molam-radius-lg)',
        'molam-sm': 'var(--molam-radius-sm)'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif']
      },
      transitionTimingFunction: {
        'molam': 'var(--transition-fast)'
      },
      boxShadow: {
        'molam-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'molam': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'molam-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
      }
    }
  },
  plugins: []
};
