import { describe, it, expect } from "vitest";
import SQLiteDatabase from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Database } from "~/services/database";
import { schema } from "~/services/database/schema";
import fs from "fs";
import { exec } from "child_process";
import { RepoError } from "../git/repo";
import { tmpdir } from "node:os";
import { sep } from "path";

const TEST_SQLITE = "test.sqlite";
const originalPathToGitRepo = "/Users/jeffsee/code/movie-content";

const tmpDir = tmpdir();

export const setup = async (
  args: {
    // When using a real db, ensure the schema is scaffolded via push:sqlite
    sqliteUrl?: string;
  } = { sqliteUrl: ":memory:" }
) => {
  const pathToGitRepo = await fs.mkdtempSync(`${tmpDir}${sep}`);
  await fs.cpSync(originalPathToGitRepo, pathToGitRepo, { recursive: true });
  const sqlite = new SQLiteDatabase(args.sqliteUrl);
  const drizzleDB = drizzle(sqlite, { schema: schema });
  const database = new Database(drizzleDB);
  if (args.sqliteUrl === ":memory:") {
    await migrate(drizzleDB, { migrationsFolder: "./drizzle.test" });
  }
  database.reset();
  return { database, pathToGitRepo };
};

function listGitBranches(cwd: string) {
  return new Promise((resolve, reject) => {
    exec("git branch", { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(`Error listing branches: ${error}`);
        return;
      }
      if (stderr) {
        reject(`Git stderr: ${stderr}`);
        return;
      }
      const branches = stdout
        .trim()
        .split("\n")
        .map((branch) => branch.trim().replace(/^\*?\s+/, ""));
      resolve(branches);
    });
  });
}

describe("clone", () => {
  it("works", async () => {
    const { database, pathToGitRepo } = await setup({ sqliteUrl: TEST_SQLITE });

    await database.git.repo(pathToGitRepo).clone();

    await database.git.repo(pathToGitRepo).branch({ ref: "new-branch" });
    await database.git.repo(pathToGitRepo).push({ ref: "new-branch" });

    const branches = await listGitBranches(pathToGitRepo);
    expect(branches).toContain("new-branch");
  });

  it("errors when already cloned", async () => {
    const { database, pathToGitRepo } = await setup({ sqliteUrl: TEST_SQLITE });

    await database.git.repo(pathToGitRepo).clone();
    await expect(
      async () => await database.git.repo(pathToGitRepo).clone()
    ).rejects.toThrowError(RepoError);
  });

  it("force clones", async () => {
    const { database, pathToGitRepo } = await setup({ sqliteUrl: TEST_SQLITE });
    await database.git.repo(pathToGitRepo).clone();
    await database.git.repo(pathToGitRepo).clone({ force: true });
  });
  it(
    "clones from github",
    async () => {
      const { database } = await setup({ sqliteUrl: TEST_SQLITE });
      await database.git
        .repo("https://github.com/jeffsee55/movie-content")
        .clone();
    },
    { timeout: 10000 }
  );
  it(
    "supports multiple simulatenous reops",
    async () => {
      const { database, pathToGitRepo } = await setup({
        sqliteUrl: TEST_SQLITE,
      });
      await database.git
        .repo("https://github.com/jeffsee55/movie-content")
        .clone();
      const files = await database.git
        .repo("https://github.com/jeffsee55/movie-content")
        .listFiles({ ref: "main" });
      console.log(files);
      await database.git.repo(pathToGitRepo).clone();
      const files2 = await database.git
        .repo(pathToGitRepo)
        .listFiles({ ref: "main" });
      console.log(files2);
    },
    { timeout: 10000 }
  );
});
