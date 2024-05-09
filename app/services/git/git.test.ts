import { describe, expect, it } from "vitest";
import { tables } from "~/services/git/schema";
import tmp from "tmp-promise";
import { Repo, movieRepoPath, movieRepoConfig } from "./git";
import { loadDatabase } from "./database";

tmp.setGracefulCleanup();

const TEST_SQLITE = "test.sqlite";
const largeRepoPath = "/Users/jeffsee/code/smashing-magazine";
largeRepoPath;

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
  it.skip("cloning twice doesn't error", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
      // repoPath: largeRepoPath,
    });

    await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      branchName: "main",
    });

    await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      branchName: "main",
    });
  });
  it("cloning another branch only results in a delta update", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
      // repoPath: largeRepoPath,
    });

    await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      branchName: "main",
    });
    // expect no blobs_to_branches to have a path for "content/actors/actor6.md"

    await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      branchName: "feat-1",
    });
    // expect blobs_to_branches to have a path for "content/actors/actor6.md"
    // expect to find it on feat-1
    // expect content/actors/actor5.md not to have been called for upsert
  });
  it.only("works", async () => {
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

    const result6 = await branch.list({ limit: 100 });
    await expect(JSON.stringify(result6, null, 2)).toMatchFileSnapshot(
      "queries/6.json"
    );

    // testing fast-forward merge
    const campaignBranch = await branch.checkoutNewBranch({
      newBranchName: "summer-campaign",
    });
    const result6aa = await campaignBranch.list({ limit: 100 });
    expect(result6.items).toEqual(result6aa.items);

    await campaignBranch.upsert({
      path: "content/movies/comedies/movie5.json",
      content: "some-content-5",
    });
    const result6b = await branch.list();
    expect(result6b.items.map((item) => item.path)).not.toContain(
      "content/movies/comedies/movie5.json"
    );
    const result6c = await campaignBranch.list();
    expect(result6c.items.map((item) => item.path)).toContain(
      "content/movies/comedies/movie5.json"
    );
    await branch.merge(campaignBranch);
    expect(branch.commitOid).toEqual(campaignBranch.commitOid);
    const result6d = await branch.list();
    expect(result6d.items.map((item) => item.path)).toContain(
      "content/movies/comedies/movie5.json"
    );

    await repo.checkout({ branchName: "feat-1" });
    const branch2 = await repo.getBranch({ branchName: "feat-1" });
    const result7 = await branch2.list();
    await expect(JSON.stringify(result7, null, 2)).toMatchFileSnapshot(
      "queries/7.json"
    );

    // testing proper merge

    const otherBranch = await branch.checkoutNewBranch({
      newBranchName: "other-branch",
    });
    await branch.upsert({
      path: "content/movies/comedies/movie6.json",
      content: "some-content-6",
    });
    await otherBranch.upsert({
      path: "content/movies/comedies/movie7.json",
      content: "some-content-7",
    });
    await branch.merge(otherBranch);
  });
});
