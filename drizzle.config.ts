import type { Config } from "drizzle-kit";

export default {
  schema: "./app/services/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: ":memory:",
  },
  driver: "better-sqlite",
} satisfies Config;
