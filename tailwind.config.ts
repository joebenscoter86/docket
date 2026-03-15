import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1e293b", // slate-800
        },
        accent: {
          DEFAULT: "#2563eb", // blue-600
          hover: "#1d4ed8",   // blue-700
        },
        success: {
          DEFAULT: "#16a34a", // green-600
        },
        warning: {
          DEFAULT: "#f59e0b", // amber-500
        },
        error: {
          DEFAULT: "#dc2626", // red-600
        },
        surface: {
          DEFAULT: "#ffffff",
        },
        border: {
          DEFAULT: "#e5e7eb", // gray-200
        },
      },
    },
  },
  plugins: [],
};
export default config;
