import type { Config } from "drizzle-kit";
import { drizzle } from "drizzle-orm/better-sqlite3";
import SQLiteDatabase from "better-sqlite3";
import { schema } from "~/services/git-2/schema";

const credentials = {
  url: ":memory:",
};

export const dbSetup = () => {
  const sqlite = new SQLiteDatabase(credentials.url);

  const db = drizzle(sqlite, { schema: schema });
  return { db };
};

export const drizzleConfig = {
  schema: "./app/services/git-2/schema.ts",
  out: "./drizzle.test",
  dbCredentials: credentials,
  // driver: "better-sqlite",
  // driver: ''
  dialect: "sqlite",
} satisfies Config;
