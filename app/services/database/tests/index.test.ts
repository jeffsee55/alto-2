import { expect, it } from "vitest";
import SQLiteDatabase from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Database } from "~/services/database";
import { schema } from "~/services/database/schema";

export const setup = async () => {
  const sqlite = new SQLiteDatabase(":memory:");
  const drizzleDB = drizzle(sqlite, { schema: schema });
  await migrate(drizzleDB, { migrationsFolder: "./drizzle" });
  const database = new Database(drizzleDB);
  return database;
};

it("does it", async () => {
  const database = await setup();
  expect(true).toBe(true);
  await database._db.insert(database._schema.documents).values({
    collection: "page",
    dir: "content",
    json: `{"json": "ok"}`,
    locale: "en",
    name: "hello",
    schemaVersion: 1,
    sha: "abc123",
  });
  const document = await database._db.query.documents.findFirst();
  console.log(document);
});
