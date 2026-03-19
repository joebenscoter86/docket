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
        "hero-slide-in": {
          "0%": { opacity: "0", transform: "translateX(-40px) rotate(-3deg)" },
          "60%": { opacity: "1", transform: "translateX(5px) rotate(0.5deg)" },
          "100%": { opacity: "1", transform: "translateX(0) rotate(0deg)" },
        },
        "hero-scan": {
          "0%": { opacity: "0", top: "40px" },
          "10%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { opacity: "0", top: "320px" },
        },
        "hero-sparkle": {
          "0%": { opacity: "0", transform: "scale(0) rotate(0deg)" },
          "50%": { opacity: "1", transform: "scale(1.5) rotate(90deg)" },
          "100%": { opacity: "0", transform: "scale(0) rotate(180deg)" },
        },
        "hero-dot": {
          "0%": { opacity: "0", transform: "scale(0)" },
          "100%": { opacity: "0.4", transform: "scale(1)" },
        },
        "hero-data-appear": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "hero-field-fade": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "hero-check-pop": {
          "0%": { opacity: "0", transform: "scale(0)" },
          "70%": { transform: "scale(1.15)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out forwards",
        "hero-slide-in": "hero-slide-in 0.8s ease-out 0.5s both",
        "hero-scan": "hero-scan 1.5s ease-in-out 1.5s both",
        "hero-sparkle-1": "hero-sparkle 0.6s ease-out 2.2s both",
        "hero-sparkle-2": "hero-sparkle 0.6s ease-out 2.4s both",
        "hero-sparkle-3": "hero-sparkle 0.6s ease-out 2.6s both",
        "hero-dot-1": "hero-dot 0.3s ease-out 2.2s both",
        "hero-dot-2": "hero-dot 0.3s ease-out 2.3s both",
        "hero-dot-3": "hero-dot 0.3s ease-out 2.4s both",
        "hero-dot-4": "hero-dot 0.3s ease-out 2.5s both",
        "hero-dot-5": "hero-dot 0.3s ease-out 2.6s both",
        "hero-data-appear": "hero-data-appear 0.6s ease-out 2.5s both",
        "hero-field-1": "hero-field-fade 0.4s ease-out 2.8s both",
        "hero-field-2": "hero-field-fade 0.4s ease-out 3.1s both",
        "hero-field-3": "hero-field-fade 0.4s ease-out 3.4s both",
        "hero-field-4": "hero-field-fade 0.4s ease-out 3.7s both",
        "hero-field-5": "hero-field-fade 0.4s ease-out 4.0s both",
        "hero-check": "hero-check-pop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) 4.5s both",
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
          DEFAULT: "#94A3B8",
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
