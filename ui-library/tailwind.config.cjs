module.exports = {
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      borderRadius: {
        "2xl": "1rem"
      },
      boxShadow: {
        sm: "0 1px 2px rgba(16,24,40,0.04)",
        lg: "0 10px 30px rgba(2,6,23,0.08)"
      },
      colors: {
        molam: {
          50: "#F6FBFF",
          100: "#EAF6FF",
          500: "var(--molam-primary)"
        }
      }
    }
  },
  plugins: []
};

