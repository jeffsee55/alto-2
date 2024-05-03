import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: "Raleway, Oswald, ui-serif", // Adds a new `font-display` class
      },
    },
  },
  plugins: [],
} satisfies Config;
