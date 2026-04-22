/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary:  "#C4623A",
        cream:    "#FAF7F2",
        navy:     "#1A1A2E",
        gold:     "#D4A843",
        surface:  "#F5F0EA",
        muted:    "#6B6560",
        dark:     "#2C2825",
      },
      fontFamily: {
        serif: ["Playfair Display", "Georgia", "serif"],
        sans:  ["Manrope", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}