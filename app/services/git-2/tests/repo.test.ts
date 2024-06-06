// @vitest-environment jsdom
import { expect, it } from "vitest";
import { tables } from "~/services/git/schema";
import tmp from "tmp-promise";
import { FilesystemRepo } from "../repo/filesystem";
import { TrpcRepo } from "../repo/trpc";
import { loadDatabase } from "../database";
// import { migrate } from "drizzle-orm/libsql/migrator";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { createCaller, appRouter } from "../repo/trpc-router";
import { httpClient } from "../repo/trpc-client";
// import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

tmp.setGracefulCleanup();

const largeRepoPath = "/Users/jeffsee/code/smashing-magazine";
const movieRepoPath = "/Users/jeffsee/code/movie-content";
largeRepoPath;

export const setup = async (args?: { memory?: boolean; filename?: string }) => {
  const { db } = loadDatabase(args);
  // had weird rust error on my machine so can't use libsql
  try {
    if (db instanceof BaseSQLiteDatabase) {
      await migrate(db, { migrationsFolder: "drizzle.turso" });
    }
  } catch (e) {
    console.log(e);
    //
  }
  for await (const table of Object.values(tables)) {
    await db.delete(table).run();
  }
  return {
    db,
  };
};

it("can clone a repo", async () => {
  const { db: serverDB } = await setup();
  const { db: browserDB } = await setup();

  const { repo, branch } = await FilesystemRepo.clone({
    db: serverDB,
    dir: movieRepoPath,
    orgName: "jeffsee55",
    repoName: "movie-content",
    branchName: "main",
  });
  expect(await branch.currentCommit()).toBeDefined();

  const caller = createCaller({ repo });

  const { branch: branchFromBrowser } = await TrpcRepo.clone({
    db: browserDB,
    trpc: caller,
    orgName: "jeffsee55",
    repoName: "movie-content",
    branchName: "main",
  });
  expect(branchFromBrowser).toBeDefined();
});
