/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      borderRadius: {
        'xl': '12px',
        '2xl': '16px'
      },
      spacing: {
        '18': '4.5rem'
      },
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding'
      }
    }
  },
  plugins: []
};
