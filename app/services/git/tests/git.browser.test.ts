// @vitest-environment jsdom
// import "@vitest/web-worker";

import { describe, expect, it } from "vitest";
import { GitBrowser } from "../git.browser";
import { tables } from "~/services/git/schema";
import { common } from "./common";
import { loadDatabase } from "../database";
import { Repo, movieRepoPath, movieRepoConfig } from "../git";
import { GitServer } from "../git.node";

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

describe("shared logic with node", async () => {
  const b = new GitBrowser();
  for await (const [key, value] of Object.entries(common)) {
    it(key, async () => {
      const result = await value(b);
      expect(result.value).toMatchFileSnapshot(result.file);
    });
  }
});

describe("using the client", async () => {
  it("does it", async () => {
    const { db } = await setup();
    // const alto = getAlto();
    // await db.insert(tables.repos).values({
    //   orgName: "jeffsee55",
    //   repoName: "movie-content",
    //   remoteUrl: "",
    // });
    // const meh = await alto.db.query.repos.findFirst();
    // console.log({ meh });
    const repo = await Repo.clone({
      ...movieRepoConfig,
      db: db,
      dir: movieRepoPath,
      exec: new GitServer(),
      branchName: "main",
    });
    const branch = await repo.getBranch({ branchName: "main" });
    const commit = await branch.currentCommit();

    const tree = commit.tree;

    const hash = await branch.gitExec.buildTreeHash({
      tree: commit.tree,
    });
    console.log(hash);
    branch.gitExec.exec = new GitBrowser();

    const hash2 = await branch.gitExec.buildTreeHash({
      tree: commit.tree,
    });
    console.log(hash2);
    expect(hash).toEqual(hash2);
    expect(tree).toBe(commit.tree);

    // await branch.upsert({
    //   content: "hello, world",
    //   path: "content/movies/movie1.json",
    // });

    // await branch.upsert({
    //   content: "hello, world",
    //   path: "content/movies/movie1.json",
    // });
    // await expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
    //   "queries/1.json"
    // );
  });
});
