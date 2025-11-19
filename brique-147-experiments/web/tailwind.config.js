/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        '2xl': '1rem'
      },
      colors: {
        primary: {
          500: '#0A84FF',
          600: '#0070E0',
          700: '#005CC1'
        }
      }
    },
  },
  plugins: [],
}
