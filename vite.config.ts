/// <reference types="vitest" />
import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals();

export default defineConfig({
  plugins: [remix(), tsconfigPaths()],
  test: {
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    setupFiles: ["dotenv/config"], // load .env file
  },
});
