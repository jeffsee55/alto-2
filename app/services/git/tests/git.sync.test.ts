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
    it("does a not sync when it's behind the remote", async () => {
      const { branchFromBrowser, branchFromNode } = await setup2();
      const baseBrowserCommit = await branchFromBrowser.currentCommit();
      const baseNodeCommit = await branchFromNode.currentCommit();
      expect(baseBrowserCommit.oid).toEqual(baseNodeCommit.oid);

      await branchFromBrowser.upsert({
        content: "this is a movie",
        path: "content/movies/movie1.json",
      });
      await branchFromNode.upsert({
        content: "this is a movie, too",
        path: "content/movies/movie2.json",
      });
      await branchFromNode.upsert({
        content: "another one",
        path: "content/movies/movie3.json",
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
      // console.log(latestCommit);

      // for await (const change of diffs.behind) {
      //   console.dir(change, { depth: null });
      // }

      // console.dir(diffs, { depth: null });

      // expect(changes.direction).toEqual("behind");
      // expect(changes.behind[0].modified[0].path).toEqual(
      //   "content/movies/movie2.json"
      // );
      // console.dir(changes, { depth: null });
      // await expect(
      //   async () => await branchFromNode.syncChanges(changes)
      // ).rejects.toThrowError(GitError);

      // The remote is ahead, so we'll prompt the user to pull those
      // changes in, if they want. This is where I'm confused, I need
      // to do a fast-forward merge here, I guess. Do I want/need
      // the merge commit? And then, when I push my changes again
      // the merge base won't be right, will it?
      // await branchFromBrowser.syncChanges({
      //   direction: "ahead",
      //   changes: changes.changes,
      // });

      // const result = await branchFromBrowser.find({
      //   path: "content/movies/movie2.json",
      // });
      // expect(result?.item.blob.content).toEqual("this is a movie, too");

      // The result here is totally wrong because our commits
      // have different parents lineage than the server (since)
      // we haven't yet synced our changes with the server.
      // I think this is where merge commits plays a valuable
      // role, and supporting logic for 2 parents needs to
      // be addressed.

      // EDIT: I think the what I'm trying to accomplish is that
      // the server never even does this kind of merge, like a real git-server
      // if the push from the client is behind, we need to pull again
      // and try to create a merge commit. Right now we don't store
      // a remote ref, but we could if it made more sense to do so.
      // We can merge on the server, but only between 2 different branches
      const c = await branchFromNode.changesSince2(
        branchFromBrowser.commitOid,
        async (commit) => {
          return branchFromBrowser.changesSince(commit.oid);
        }
      );
      // console.dir(c, { depth: null });
      // await branchFromNode.syncChanges({
      //   direction: "ahead",
      //   changes: changes.changes,
      // });
      // const b = await branchFromNode.find({
      //   path: "content/movies/movie1.json",
      // });
      // expect(b?.item.blob.content).toEqual("this is a movie");
    });
  });
});
