import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
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
          primary: "var(--brand-primary)",
          secondary: "var(--brand-secondary)",
          tertiary: "var(--brand-tertiary)",
        },
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        line: {
          subtle: "var(--line-subtle)",
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
          faint: "var(--ink-faint)",
        },
      },
      fontFamily: {
        sans: ["var(--brand-font)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.75rem",
      },
      boxShadow: {
        glow: "0 0 0 1px color-mix(in srgb, var(--brand-primary) 30%, transparent), 0 8px 40px -8px color-mix(in srgb, var(--brand-primary) 45%, transparent)",
        "glow-lg":
          "0 0 0 1px color-mix(in srgb, var(--brand-primary) 35%, transparent), 0 24px 80px -16px color-mix(in srgb, var(--brand-primary) 55%, transparent)",
        lift: "0 24px 60px -20px rgba(0,0,0,0.7)",
        inset: "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(120deg, var(--brand-primary), var(--brand-secondary) 55%, var(--brand-tertiary))",
        "mesh-grid":
          "linear-gradient(to right, var(--line-subtle) 1px, transparent 1px), linear-gradient(to bottom, var(--line-subtle) 1px, transparent 1px)",
      },
      keyframes: {
        "aurora-drift": {
          "0%,100%": { transform: "translate3d(-6%,-4%,0) scale(1)" },
          "33%": { transform: "translate3d(6%,3%,0) scale(1.12)" },
          "66%": { transform: "translate3d(-3%,6%,0) scale(0.95)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { opacity: "0" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(400%)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "aurora-drift": "aurora-drift 22s ease-in-out infinite",
        shimmer: "shimmer 2.2s infinite",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.16,1,0.3,1) infinite",
        "scan-line": "scan-line 5s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
