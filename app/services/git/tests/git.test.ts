import { describe, expect, it } from "vitest";
import { tables } from "~/services/git/schema";
import tmp from "tmp-promise";
import { Repo, movieRepoPath, movieRepoConfig } from "../git";
import { loadDatabase } from "../database";
import { GitServer } from "../git.node";

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
      exec: new GitServer(),
      branchName: "main",
    });

    await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });
  });
  it("cloning creates a remote branch and local branch", async () => {
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
      exec: new GitServer(),
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
      exec: new GitServer(),
    });
    // expect no blobs_to_branches to have a path for "content/actors/actor6.md"

    await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      branchName: "feat-1",
      exec: new GitServer(),
    });
    // expect blobs_to_branches to have a path for "content/actors/actor6.md"
    // expect to find it on feat-1
    // expect content/actors/actor5.md not to have been called for upsert
  });
  it("finds the merge base", async () => {
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
      exec: new GitServer(),
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const baseCommit = await branch.currentCommit();
    const campaignBranch = await branch.checkoutNewBranch({
      newBranchName: "summer-campaign",
    });
    await branch.upsert({
      content: "hello from main",
      path: "content/movies/movie2.json",
    });
    await campaignBranch.upsert({
      content: "hello, from campaign",
      path: "content/movies/movie1.json",
    });
    const baseCommit2 = await branch.findBaseCommit(campaignBranch.commitOid);
    expect(baseCommit.oid).toEqual(baseCommit2.oid);
  });
  it("finds the merge base after having updated the target", async () => {
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
      exec: new GitServer(),
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const baseCommit = await branch.currentCommit();
    const campaignBranch = await branch.checkoutNewBranch({
      newBranchName: "summer-campaign",
    });
    await branch.upsert({
      content: "hello from main",
      path: "content/movies/movie2.json",
    });
    await campaignBranch.upsert({
      content: "hello, from campaign",
      path: "content/movies/movie1.json",
    });
    const baseCommit2 = await branch.findBaseCommit(campaignBranch.commitOid);
    expect(baseCommit.oid).toEqual(baseCommit2.oid);
    const movie2a = await campaignBranch.find({
      path: "content/movies/movie2.json",
    });
    expect(movie2a?.item.blob.content).not.toEqual("hello from main");
    await campaignBranch.merge(branch);

    const movie2b = await campaignBranch.find({
      path: "content/movies/movie2.json",
    });
    expect(movie2b?.item.blob.content).toEqual("hello from main");

    const movie1a = await branch.find({
      path: "content/movies/movie1.json",
    });
    expect(movie1a?.item.blob.content).not.toEqual("hello, from campaign");
    await branch.merge(campaignBranch);

    const movie1b = await campaignBranch.find({
      path: "content/movies/movie1.json",
    });
    expect(movie1b?.item.blob.content).toEqual("hello, from campaign");
  });
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
      exec: new GitServer(),
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

    const result8 = await branch.list({ limit: 100 });
    await expect(JSON.stringify(result8, null, 2)).toMatchFileSnapshot(
      "queries/8.json"
    );
    expect(result8.items.map((item) => item.path)).toContain(
      "content/movies/comedies/movie6.json"
    );
    expect(result8.items.map((item) => item.path)).toContain(
      "content/movies/comedies/movie7.json"
    );
  });
  it("performs a fast-forward merge when an item was added", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
      // repoPath: largeRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const result = await branch.find({ path: "content/movies/movie10.json" });
    expect(result).toBeNull();
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    expect(branch.commitOid).toEqual(featureBranch.commitOid);

    await featureBranch.upsert({
      path: "content/movies/movie10.json",
      content: "some-content",
    });
    const result3 = await featureBranch.find({
      path: "content/movies/movie10.json",
    });
    expect(result3).not.toBeNull();
    const result4 = await branch.find({ path: "content/movies/movie10.json" });
    expect(result4).toBeNull();

    await branch.merge(featureBranch);
    const result5 = await branch.find({ path: "content/movies/movie10.json" });
    expect(result5?.item).toEqual(result3?.item);
  });
  it("merge on added items", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    await featureBranch.upsert({
      path: "content/movies/movie10.json",
      content: "some-content",
    });
    await branch.merge(featureBranch);
    const result = await branch.find({ path: "content/movies/movie10.json" });
    expect(result).not.toBeNull();
    const entry = (await branch.currentCommit()).getEntryForPath(
      "content/movies/movie10.json"
    );
    expect(entry?.oid).toEqual(result?.item.blob.oid);
  });
  it("merge on updated items", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    await featureBranch.upsert({
      path: "content/movies/movie2.json",
      content: "some-content",
    });
    await branch.merge(featureBranch);
    const result = await branch.find({ path: "content/movies/movie2.json" });
    expect(result?.item.blob.content).toEqual("some-content");
    const entry = (await branch.currentCommit()).getEntryForPath(
      "content/movies/movie2.json"
    );
    expect(entry?.oid).toEqual(result?.item.blob.oid);
  });
  it("merge on deleted items", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    await featureBranch.delete({
      path: "content/movies/movie2.json",
    });
    await branch.merge(featureBranch);
    const result = await branch.find({ path: "content/movies/movie2.json" });
    expect(result).toBeNull();
    const entry = (await branch.currentCommit()).getEntryForPath(
      "content/movies/movie2.json"
    );
    expect(entry).toBeUndefined();
  });
  it("diffs added items", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const result = await branch.find({ path: "content/movies/movie10.json" });
    expect(result).toBeNull();
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    expect(branch.commitOid).toEqual(featureBranch.commitOid);

    await featureBranch.upsert({
      path: "content/movies/movie10.json",
      content: "some-content",
    });
    const result3 = await featureBranch.find({
      path: "content/movies/movie10.json",
    });
    expect(result3).not.toBeNull();
    const result4 = await branch.find({ path: "content/movies/movie10.json" });
    expect(result4).toBeNull();

    const diffs = await branch.diff(featureBranch);
    expect(diffs.added).toMatchInlineSnapshot(`
      [
        {
          "path": "content/movies/movie10.json",
          "theirOid": "74cd6e7f8ed6a461d89b53663bf6c0c31c7f18c0",
        },
      ]
    `);
  });
  it("diffs deleted items", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const result = await branch.find({ path: "content/movies/movie10.json" });
    expect(result).toBeNull();
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    expect(branch.commitOid).toEqual(featureBranch.commitOid);

    await featureBranch.delete({
      path: "content/movies/movie2.json",
    });

    const diffs = await branch.diff(featureBranch);
    expect(diffs.deleted).toMatchInlineSnapshot(`
      [
        {
          "baseOid": "68ba6caaf14afcc396260bd50645df85f0831167",
          "ourOid": "68ba6caaf14afcc396260bd50645df85f0831167",
          "path": "content/movies/movie2.json",
        },
      ]
    `);
  });
  it("diffs modified items", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
      // repoPath: largeRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      exec: new GitServer(),
      dir: movieRepoPath,
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const result = await branch.find({ path: "content/movies/movie10.json" });
    expect(result).toBeNull();
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    expect(branch.commitOid).toEqual(featureBranch.commitOid);

    await featureBranch.upsert({
      path: "content/movies/movie2.json",
      content: "some-new-content",
    });

    const diffs = await branch.diff(featureBranch);
    expect(diffs.modified).toMatchInlineSnapshot(`
      [
        {
          "baseOid": "68ba6caaf14afcc396260bd50645df85f0831167",
          "ourOid": "68ba6caaf14afcc396260bd50645df85f0831167",
          "path": "content/movies/movie2.json",
          "theirOid": "f349ff82b55ef79d9e14807a009b57d2f97697ae",
        },
      ]
    `);
  });
  it("performs a fast-forward merge when an item was modified", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
      // repoPath: largeRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const result = await branch.find({ path: "content/movies/movie2.json" });
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-3",
    });
    await featureBranch.upsert({
      path: "content/movies/movie2.json",
      content: "some-content",
    });
    const result2 = await featureBranch.find({
      path: "content/movies/movie2.json",
    });
    expect(result?.item).not.toEqual(result2?.item);
    await branch.merge(featureBranch);
    const result3 = await branch.find({ path: "content/movies/movie2.json" });

    expect(result3?.item).toEqual(result2?.item);
  });
  it("performs a fast-forward-ish merge when an item was modified and the target branch has been modified for another file", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
      // repoPath: largeRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const result = await branch.find({ path: "content/movies/movie2.json" });
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-3",
    });
    await featureBranch.upsert({
      path: "content/movies/movie2.json",
      content: "some-content",
    });
    const result2 = await featureBranch.find({
      path: "content/movies/movie2.json",
    });
    expect(result?.item).not.toEqual(result2?.item);
    // make some other change on the main branch so it's not a fast-forward merge
    await branch.upsert({
      path: "content/movies/movie1.json",
      content: "some-content-1",
    });
    await branch.merge(featureBranch);
    const result3 = await branch.find({ path: "content/movies/movie2.json" });

    expect(result3?.item).toEqual(result2?.item);
  });
  it("performs a fast-forward merge when an item was deleted", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
      // repoPath: largeRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    const result = await branch.find({ path: "content/movies/movie2.json" });
    const result2 = await featureBranch.find({
      path: "content/movies/movie2.json",
    });
    expect(result?.item).toEqual(result2?.item);
    expect(branch.commitOid).toEqual(featureBranch.commitOid);

    await featureBranch.delete({ path: "content/movies/movie2.json" });
    const result3 = await branch.find({ path: "content/movies/movie2.json" });
    expect(result3).not.toBeNull();
    const result4 = await featureBranch.find({
      path: "content/movies/movie2.json",
    });
    expect(result4).toBeNull();
    await branch.merge(featureBranch);
    const result5 = await branch.find({ path: "content/movies/movie2.json" });
    expect(result5).toBeNull();
  });
  it("shows a merge conflict for a file that has been changed by both", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    await branch.upsert({
      path: "content/movies/movie2.json",
      content: "some-other-content",
    });
    await featureBranch.upsert({
      path: "content/movies/movie2.json",
      content: "some-content",
    });
    await expect(() => branch.merge(featureBranch)).rejects.toThrowError();
  });
  it("merges for a file that has been changed by both", async () => {
    const { db } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
    });

    const repo = await Repo.clone({
      ...movieRepoConfig,
      db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });

    const branch = await repo.getBranch({ branchName: "main" });
    // Create a baseline version that will be changed after the branch split
    await branch.upsert({
      path: "content/actors/actor1.md",
      content: `This is some text

      And here is some more text
      `,
    });

    const featureBranch = await branch.checkoutNewBranch({
      newBranchName: "feature-2",
    });
    await branch.upsert({
      path: "content/actors/actor1.md",
      content: `This is some text. Adding more text to the first line from the "main" branch

      And here is some more text
      `,
    });
    await featureBranch.upsert({
      path: "content/actors/actor1.md",
      content: `This is some text

      And here is some more text. Adding more text to the second line from the "feature-2" branch
      `,
    });
    await branch.merge(featureBranch);
    const result = await branch.find({ path: "content/actors/actor1.md" });
    expect(result?.item.blob.content)
      .toEqual(`This is some text. Adding more text to the first line from the "main" branch

      And here is some more text. Adding more text to the second line from the "feature-2" branch
      `);
  });
});
