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
    const changes = await branchFromBrowser.changesSince2(
      branchFromNode.commitOid,
      async (commit) => {
        return branchFromNode.changesSince(commit.oid);
      }
    );

    expect(changes.changes[0].modified[0].path).toEqual(
      "content/movies/movie1.json"
    );

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
    const changes = await branchFromBrowser.changesSince2(
      branchFromNode.commitOid,
      async (commit) => {
        return branchFromNode.changesSince(commit.oid);
      }
    );

    expect(changes.changes[0].added[0].path).toEqual(
      "content/movies/movie100.json"
    );

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
    const changes = await branchFromBrowser.changesSince2(
      branchFromNode.commitOid,
      async (commit) => {
        return branchFromNode.changesSince(commit.oid);
      }
    );

    expect(changes.changes[0].deleted[0].path).toEqual(
      "content/movies/movie1.json"
    );

    expect(branchFromBrowser.commitOid).not.toEqual(branchFromNode.commitOid);

    await branchFromNode.syncChanges(changes);

    expect(branchFromBrowser.commitOid).toEqual(branchFromNode.commitOid);
  });
  it("multiple modifications", async () => {
    const { branchFromBrowser, branchFromNode } = await setup2();
    expect(branchFromBrowser.commitOid).toEqual(branchFromNode.commitOid);

    await branchFromBrowser.upsert({
      content: "this is a movie",
      path: "content/movies/movie1.json",
    });

    await branchFromBrowser.upsert({
      content: "this is a movie, too",
      path: "content/movies/movie100.json",
    });
    const changes = await branchFromBrowser.changesSince2(
      branchFromNode.commitOid,
      async (commit) => {
        return branchFromNode.changesSince(commit.oid);
      }
    );

    expect(changes.changes[0].modified[0].path).toEqual(
      "content/movies/movie1.json"
    );

    expect(branchFromBrowser.commitOid).not.toEqual(branchFromNode.commitOid);

    await branchFromNode.syncChanges(changes);

    expect(branchFromBrowser.commitOid).toEqual(branchFromNode.commitOid);
  });
  describe("when the remote has changes", () => {
    it.only("does a not sync when it's behind the remote", async () => {
      const { branchFromBrowser, branchFromNode } = await setup2();
      const baseBrowserCommit = await branchFromBrowser.currentCommit();
      const baseNodeCommit = await branchFromNode.currentCommit();
      expect(baseBrowserCommit.oid).toEqual(baseNodeCommit.oid);

      const runQueries = async () => {
        const itemToModify = await branchFromBrowser.find({
          path: "content/movies/movie1.json",
        });
        const itemToAdd = await branchFromBrowser.find({
          path: "content/movies/movie13.json",
        });
        const itemToDelete = await branchFromBrowser.find({
          path: "content/movies/movie2.json",
        });
        return { itemToModify, itemToAdd, itemToDelete };
      };

      const { itemToModify, itemToAdd, itemToDelete } = await runQueries();
      expect(itemToModify?.item.blob.content).not.toEqual("this is a movie");
      expect(itemToAdd).toBe(null);
      expect(itemToDelete).not.toBe(null);

      await branchFromBrowser.upsert({
        content: "this is a movie",
        path: "content/movies/movie1.json",
      });
      await branchFromNode.upsert({
        content: "another one",
        path: "content/movies/movie3.json",
      });
      await branchFromNode.upsert({
        content: "another one new movie",
        path: "content/movies/movie13.json",
      });
      await branchFromNode.delete({
        path: "content/movies/movie2.json",
      });

      const mergeBaseCommit = await branchFromBrowser.findMergeBase({
        branch: branchFromNode,
      });
      expect(mergeBaseCommit.oid).toEqual(baseBrowserCommit.oid);

      const changes3 = await branchFromBrowser.changesSince(
        mergeBaseCommit.oid
      );
      const changes4 = await branchFromNode.changesSince(mergeBaseCommit.oid);
      const diffs = {
        ahead: changes3,
        behind: changes4,
      };

      const latestCommit = await mergeBaseCommit.createCommitLineage(
        diffs.behind
      );
      const commitFromNode = await branchFromNode.currentCommit();
      expect(latestCommit.oid).toEqual(commitFromNode.oid);

      const commit = await branchFromBrowser.currentCommit();
      await commit.createMergeCommit(
        mergeBaseCommit,
        latestCommit,
        branchFromBrowser
      );

      const queriesAfterMerge = await runQueries();
      expect(queriesAfterMerge.itemToModify?.item.blob.content).toEqual(
        "this is a movie"
      );
      expect(queriesAfterMerge.itemToAdd).not.toBe(null);
      expect(queriesAfterMerge.itemToDelete).toBe(null);
    });
  });
});
