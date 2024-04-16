import { describe, expect, it } from "vitest";
import SQLiteDatabase from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Database } from "~/services/database";
import { schema } from "~/services/database/schema";
import fs from "fs";
import { tmpdir } from "node:os";
import { sep } from "path";

const TEST_SQLITE = "test.sqlite";
const movieRepoPath = "/Users/jeffsee/code/movie-content";
const largeRepoPath = "/Users/jeffsee/code/smashing-magazine";

const tmpDir = tmpdir();

export const setup = async (
  args: {
    // When using a real db, ensure the schema is scaffolded via push:sqlite
    sqliteUrl?: string;
    preventReset?: boolean;
    repoPath?: string;
  } = { sqliteUrl: ":memory:", repoPath: movieRepoPath }
) => {
  const pathToGitRepo = await fs.mkdtempSync(`${tmpDir}${sep}`);
  await fs.cpSync(args.repoPath || movieRepoPath, pathToGitRepo, {
    recursive: true,
  });
  const sqlite = new SQLiteDatabase(args.sqliteUrl);
  const drizzleDB = drizzle(sqlite, { schema: schema });
  const database = new Database(drizzleDB);
  if (args.sqliteUrl === ":memory:") {
    await migrate(drizzleDB, { migrationsFolder: "./drizzle.test" });
  }
  if (!args.preventReset) {
    await database.reset();
  }
  return { database, pathToGitRepo };
};

describe("clone", () => {
  it(
    "works",
    async () => {
      const { database } = await setup({
        sqliteUrl: TEST_SQLITE,
      });

      await database.git.repo(largeRepoPath).clone();
    },
    { timeout: 60000 }
  );
  it("lists files from any ref", async () => {
    const { database } = await setup({
      sqliteUrl: TEST_SQLITE,
      preventReset: true,
    });
    const files = await database.git
      .repo(largeRepoPath)
      .listFiles({ ref: "remotes/origin/testing-32" });
    expect(files.length).toEqual(11291);
  });
  it("it gets files from any ref", async () => {
    const { database } = await setup({
      sqliteUrl: TEST_SQLITE,
      preventReset: true,
    });
    const filepath =
      "site/production-articles/2024-01-02-view-transitions-api-ui-animations-part2.md";
    const filepath2 =
      "site/production-articles/2024-03-12-event-calendars-web-commercial-options.md";
    const cache = {};
    const file = await database.git.repo(largeRepoPath).get({
      ref: "remotes/origin/testing-32",
      filepath,
      cache,
    });
    expect(file.string).toMatchFileSnapshot(`large-repo-snaps/${filepath}`);
    const file2 = await database.git.repo(largeRepoPath).get({
      ref: "remotes/origin/testing-32",
      filepath: filepath2,
      cache,
    });
    expect(file2.string).toMatchFileSnapshot(`large-repo-snaps/${filepath2}`);
  });
});
