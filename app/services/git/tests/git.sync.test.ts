// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { tables } from "~/services/git/schema";
import tmp from "tmp-promise";
import { Repo, movieRepoPath, movieRepoConfig } from "../git";
import { loadDatabase } from "../database";
import { GitServer } from "../git.node";
import { migrate } from "drizzle-orm/libsql/migrator";
import { LibSQLDatabase } from "drizzle-orm/libsql";

tmp.setGracefulCleanup();

const largeRepoPath = "/Users/jeffsee/code/smashing-magazine";
largeRepoPath;

export const setup = async (args?: { memory?: boolean }) => {
  const pathToGitRepo = movieRepoPath;
  const { db } = loadDatabase(args);
  try {
    if (db instanceof LibSQLDatabase) {
      await migrate(db, { migrationsFolder: "drizzle.turso" });
    }
  } catch (e) {
    //
  }
  for await (const table of Object.values(tables)) {
    await db.delete(table).run();
  }

  return {
    db,
    pathToGitRepo,
  };
};

const setup2 = async () => {
  const { db } = await setup();
  const { db: db2 } = await setup({ memory: true });

  const repoInNode = await Repo.clone({
    ...movieRepoConfig,
    db,
    dir: movieRepoPath,
    branchName: "main",
    exec: new GitServer(),
  });
  const repoInBrowser = await Repo.clone({
    ...movieRepoConfig,
    db: db2,
    dir: movieRepoPath,
    branchName: "main",
    exec: new GitServer(),
  });

  const branchFromBrowser = await repoInBrowser.getBranch({
    branchName: "main",
  });
  const branchFromNode = await repoInNode.getBranch({ branchName: "main" });
  return { branchFromBrowser, branchFromNode };
};

describe("syncing", async () => {
  it("after a modified file", async () => {
    const { branchFromBrowser, branchFromNode } = await setup2();
    expect(branchFromBrowser.commitOid).toEqual(branchFromNode.commitOid);

    await branchFromBrowser.upsert({
      content: "this is a movie",
      path: "content/movies/movie1.json",
    });
    const changes = await branchFromBrowser.changesSince(
      branchFromNode.commitOid
    );

    expect(changes[0].modified[0].path).toEqual("content/movies/movie1.json");

    expect(branchFromBrowser.commitOid).not.toEqual(branchFromNode.commitOid);

    await branchFromNode.syncChanges(changes);

    expect(branchFromBrowser.commitOid).toEqual(branchFromNode.commitOid);
  });
  it("after an added file", async () => {
    const { branchFromBrowser, branchFromNode } = await setup2();
    expect(branchFromBrowser.commitOid).toEqual(branchFromNode.commitOid);

    await branchFromBrowser.upsert({
      content: "this is a movie",
      path: "content/movies/movie100.json",
    });
    const changes = await branchFromBrowser.changesSince(
      branchFromNode.commitOid
    );

    expect(changes[0].added[0].path).toEqual("content/movies/movie100.json");

    expect(branchFromBrowser.commitOid).not.toEqual(branchFromNode.commitOid);

    await branchFromNode.syncChanges(changes);

    expect(branchFromBrowser.commitOid).toEqual(branchFromNode.commitOid);
  });

  it("after a deleted file", async () => {
    const { branchFromBrowser, branchFromNode } = await setup2();
    expect(branchFromBrowser.commitOid).toEqual(branchFromNode.commitOid);

    await branchFromBrowser.delete({
      path: "content/movies/movie1.json",
    });
    const changes = await branchFromBrowser.changesSince(
      branchFromNode.commitOid
    );

    expect(changes[0].deleted[0].path).toEqual("content/movies/movie1.json");

    expect(branchFromBrowser.commitOid).not.toEqual(branchFromNode.commitOid);

    await branchFromNode.syncChanges(changes);

    expect(branchFromBrowser.commitOid).toEqual(branchFromNode.commitOid);
  });
});
