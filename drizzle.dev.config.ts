import type { Config } from "drizzle-kit";

export default {
  schema: "./app/services/database/schema.ts",
  out: "./drizzle.dev",
  dbCredentials: {
    url: "dev.sqlite",
  },
  driver: "better-sqlite",
} satisfies Config;
