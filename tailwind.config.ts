import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: "Raleway, Oswald, ui-serif", // Adds a new `font-display` class
      },
      animation: {
        "ping-slow": "ping 3s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
