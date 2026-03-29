import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out forwards",
      },
      colors: {
        primary: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
        },
        background: {
          DEFAULT: "#F8FAFC",
        },
        surface: {
          DEFAULT: "#FFFFFF",
        },
        text: {
          DEFAULT: "#0F172A",
        },
        muted: {
          DEFAULT: "#64748B",
        },
        accent: {
          DEFAULT: "#10B981",
        },
        warning: {
          DEFAULT: "#F59E0B",
        },
        error: {
          DEFAULT: "#DC2626",
        },
        border: {
          DEFAULT: "#E2E8F0",
        },
        "nav-active": {
          DEFAULT: "#EFF6FF",
        },
      },
      fontFamily: {
        headings: ["Cabinet Grotesk", "sans-serif"],
        body: ["Satoshi", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "brand-sm": "8px",
        "brand-md": "12px",
        "brand-lg": "24px",
      },
      boxShadow: {
        soft: "0 12px 40px -8px rgba(15, 23, 42, 0.06)",
        float: "0 20px 60px -12px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
