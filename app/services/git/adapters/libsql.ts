import type { Config } from "drizzle-kit";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { schema } from "~/services/git/schema";

const credentials = {
  url: "file:./turso.db",
  // url: ":memory:",
  // url: process.env.TURSO_URL!,
  // authToken: process.env.TURSO_AUTH_TOKEN!,
};

export const dbSetup = (options?: { memory?: boolean }) => {
  const libsql = options?.memory
    ? createClient({ ...credentials, url: ":memory:" })
    : createClient(credentials);

  const db = drizzle(libsql, { schema: schema });

  return { db };
};

export const drizzleConfig = {
  schema: "./app/services/git/schema.ts",
  out: "./drizzle.turso",
  dbCredentials: credentials,
  driver: "turso",
  dialect: "sqlite",
} satisfies Config;
