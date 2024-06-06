// @vitest-environment jsdom
import { it } from "vitest";
import { tables } from "~/services/git/schema";
import tmp from "tmp-promise";
import { FilesystemRepo } from "../repo/filesystem";
import { loadDatabase } from "../database";
// import { migrate } from "drizzle-orm/libsql/migrator";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

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
  // const { db: clientDB } = await setup({ memory: true });
  // const { db: serverDB } = await setup({ memory: true });
  const { db: serverDB } = await setup();
  const { branch } = await FilesystemRepo.clone({
    db: serverDB,
    dir: movieRepoPath,
    branch: "main",
  });
  console.log("hi!", await branch.currentCommit());
});
