// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { tables } from "~/services/git/schema";
import tmp from "tmp-promise";
import { Repo } from "../git";
import { loadDatabase } from "../database";
import { GitServer } from "../git.node";
import { migrate } from "drizzle-orm/libsql/migrator";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { createCaller } from "../trpc-router";

tmp.setGracefulCleanup();

const largeRepoPath = "/Users/jeffsee/code/smashing-magazine";
largeRepoPath;

export const setup = async (args?: { memory?: boolean; filename?: string }) => {
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
  };
};

it("can clone a repo", async () => {
  console.log("hi!");
});
