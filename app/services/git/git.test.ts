import { describe, expect, it } from "vitest";
import SQLiteDatabase from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { schema, tables } from "~/services/git/schema";
import tmp from "tmp-promise";
import { Repo } from "./git";

tmp.setGracefulCleanup();

const TEST_SQLITE = "test.sqlite";
const movieRepoPath = "/Users/jeffsee/code/movie-content";
const largeRepoPath = "/Users/jeffsee/code/smashing-magazine";
largeRepoPath;

/**
 *
 * This strategy uses a combination of where the source of truth is
 * for the tree / commit / ref relationships are housed.
 *
 * The commit stores a "blobMap" object which contains the mappings
 * of paths to the actual objects. This is the canonical source
 * of truth for when we need to build a git commit
 *
 * There's also a join table between a ref and objects. The join
 * table also has the "path". So it effectively is doing the job
 * that potentially many commit/tree objects would do
 *
 */

export const setup = async (
  args: {
    // When using a real db, ensure the schema is scaffolded via push:sqlite
    sqliteUrl?: string;
    preventReset?: boolean;
    repoPath?: string;
  } = { sqliteUrl: ":memory:", repoPath: movieRepoPath }
) => {
  // const tmpDir = tmp.dirSync({ unsafeCleanup: true });
  // const pathToGitRepo = await fs.mkdtempSync(`${tmpDir.name}${sep}`);
  // await fs.cpSync(args.repoPath || movieRepoPath, pathToGitRepo, {
  //   recursive: true,
  // });
  const pathToGitRepo = args.repoPath!;
  const sqlite = new SQLiteDatabase(args.sqliteUrl);
  const db = drizzle(sqlite, { schema: schema });
  if (args.sqliteUrl === ":memory:") {
    await migrate(db, { migrationsFolder: "./drizzle.test" });
  }
  for await (const table of Object.values(tables)) {
    db.delete(table).run();
  }

  return {
    db,
    pathToGitRepo,
  };
};

describe("clone", async () => {
  it("works", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
      // repoPath: largeRepoPath,
    });

    const repo = await Repo.clone({
      org: "jeffsee55",
      name: "movie-content",
      localPath: movieRepoPath,
      db,
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });

    const result = await branch.list();
    expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
      "queries/1.json"
    );

    await branch.upsert({
      path: "content/movies/movie2.json",
      content: "some-content",
    });

    const result2 = await branch.list();
    expect(JSON.stringify(result2, null, 2)).toMatchFileSnapshot(
      "queries/2.json"
    );

    const result3 = await branch.find({ path: "content/movies/movie2.json" });
    expect(JSON.stringify(result3, null, 2)).toMatchFileSnapshot(
      "queries/3.json"
    );

    await branch.upsert({
      path: "content/movies/movie3.json",
      content: "some-content-3",
    });

    const result4 = await branch.list();
    expect(JSON.stringify(result4, null, 2)).toMatchFileSnapshot(
      "queries/4.json"
    );

    await branch.delete({ path: "content/movies/movie2.json" });

    const result5 = await branch.list();
    expect(JSON.stringify(result5, null, 2)).toMatchFileSnapshot(
      "queries/5.json"
    );
  });
});
