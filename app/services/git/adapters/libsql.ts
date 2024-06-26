import type { Config } from "drizzle-kit";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import Database from "libsql";
import { schema } from "~/services/git-2/schema";

const credentials = {
  url: "file:./turso2.db",
  // url: ":memory:",
  // url: process.env.TURSO_URL!,
  // authToken: process.env.TURSO_AUTH_TOKEN!,
};

const createClient2 = (args: Parameters<typeof createClient>[0]) => {
  const db = new Database(args.url);
  return db;
};

export const dbSetup = (options?: { memory?: boolean; filename?: string }) => {
  const libsql = options?.memory
    ? createClient2({ ...credentials, url: ":memory:" })
    : options?.filename
    ? createClient2({ ...credentials, url: options.filename })
    : createClient2(credentials);

  const db = drizzle(libsql, { schema: schema });

  return { db };
};

export const drizzleConfig = {
  schema: "./app/services/git-2/schema.ts",
  out: "./drizzle.turso",
  dbCredentials: credentials,
  driver: "turso",
  dialect: "sqlite",
} satisfies Config;
