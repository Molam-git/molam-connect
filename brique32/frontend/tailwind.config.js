module.exports = {
    content: ["./src/**/*.{js,jsx,ts,tsx}"],
    theme: {
        extend: {
            colors: {
                // Apple-like color palette
                gray: {
                    50: '#f9f9f9',
                    100: '#f2f2f2',
                    200: '#e5e5e5',
                    300: '#d1d1d1',
                    400: '#b0b0b0',
                    500: '#888888',
                    600: '#6d6d6d',
                    700: '#5a5a5a',
                    800: '#3a3a3a',
                    900: '#1d1d1f'
                }
            },
            fontFamily: {
                sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif']
            },
            boxShadow: {
                'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
                'DEFAULT': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
                'md': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)'
            }
        },
    },
    plugins: [],
}