import { describe, expect, it } from "vitest";
import { tables } from "~/services/git/schema";
import tmp from "tmp-promise";
import { Repo, movieRepoPath, movieRepoConfig } from "./git";
import { loadDatabase } from "./database";

tmp.setGracefulCleanup();

const TEST_SQLITE = "test.sqlite";
const largeRepoPath = "/Users/jeffsee/code/smashing-magazine";
largeRepoPath;

/**
 *
 * This strategy uses a combination of where the source of truth is
 * for the tree / commit / ref relationships are housed.
 *
 * The commit stores a "tree" object which contains the mappings
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
  const { db } = loadDatabase();
  for await (const table of Object.values(tables)) {
    await db.delete(table).run();
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
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });

    const result = await branch.list();
    await expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
      "queries/1.json"
    );

    await branch.upsert({
      path: "content/movies/movie2.json",
      content: "some-content",
    });

    const result2 = await branch.list();
    await expect(JSON.stringify(result2, null, 2)).toMatchFileSnapshot(
      "queries/2.json"
    );

    const result3 = await branch.find({ path: "content/movies/movie2.json" });
    await expect(JSON.stringify(result3, null, 2)).toMatchFileSnapshot(
      "queries/3.json"
    );

    await branch.upsert({
      path: "content/movies/movie3.json",
      content: "some-content-3",
    });

    const result4 = await branch.list();
    await expect(JSON.stringify(result4, null, 2)).toMatchFileSnapshot(
      "queries/4.json"
    );

    await branch.delete({ path: "content/movies/movie2.json" });

    const result5 = await branch.list();
    await expect(JSON.stringify(result5, null, 2)).toMatchFileSnapshot(
      "queries/5.json"
    );

    await branch.upsert({
      path: "content/movies/comedies/movie4.json",
      content: "some-content-4",
    });

    const result6 = await branch.list();
    await expect(JSON.stringify(result6, null, 2)).toMatchFileSnapshot(
      "queries/6.json"
    );

    await repo.checkout({ branchName: "feat-1" });
    const branch2 = await repo.getBranch({ branchName: "feat-1" });
    const result7 = await branch2.list();
    await expect(JSON.stringify(result7, null, 2)).toMatchFileSnapshot(
      "queries/7.json"
    );
  });
});
