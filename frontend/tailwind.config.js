/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        saas: {
          bg: "#0B0F19",
          surface: "#111827",
          elevated: "#1F2937",
          border: "#1E293B",
          muted: "#9CA3AF",
          fg: "#E5E7EB",
          accent: "#6366F1",
        },
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(99, 102, 241, 0.35)",
        "glow-sm": "0 0 16px -2px rgba(99, 102, 241, 0.25)",
      },
      transitionDuration: {
        250: "250ms",
      },
    },
  },
  plugins: [],
};
