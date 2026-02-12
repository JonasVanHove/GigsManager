import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Neon-bright indigo/purple
          50: "#f0f0ff",
          100: "#e6e6ff",
          200: "#cdcdff",
          300: "#b4b4ff",
          400: "#9b9bff",
          500: "#8282ff",
          600: "#6969ff", // Main brand - bright neon purple
          700: "#5050ff",
          800: "#3737ff",
          900: "#1e1eff",
          950: "#0f0fcc",
        },
        neon: {
          cyan: "#00d9ff",
          pink: "#ff006e",
          lime: "#39ff14",
          orange: "#ff6600",
          purple: "#9d00ff",
          green: "#00ff41",
        },
      },
      backgroundColor: {
        dark: "#0a0a0f",
        "dark-secondary": "#1a1a25",
        "dark-tertiary": "#25252f",
      },
    },
  },
  plugins: [],
};

export default config;
