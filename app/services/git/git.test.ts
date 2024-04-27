import { describe, expect, it } from "vitest";
import SQLiteDatabase from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { schema, tables } from "~/services/git/schema";
import tmp from "tmp-promise";
import { and, eq, not } from "drizzle-orm";

tmp.setGracefulCleanup();

const TEST_SQLITE = "test.sqlite";
const movieRepoPath = "/Users/jeffsee/code/movie-content";
const largeRepoPath = "/Users/jeffsee/code/smashing-magazine";
largeRepoPath;

/**
 *
 * This strategy uses a combination of where the source of truth is
 * for the tree / commit / ref relationships are housed.
 *
 * The commit stores a "blobMap" object which contains the mappings
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
  const sqlite = new SQLiteDatabase(args.sqliteUrl);
  const db = drizzle(sqlite, { schema: schema });
  if (args.sqliteUrl === ":memory:") {
    await migrate(db, { migrationsFolder: "./drizzle.test" });
  }
  for await (const table of Object.values(tables)) {
    db.delete(table).run();
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

    await db
      .insert(tables.repos)
      .values({ org: "jeffsee55", name: "movie-content" });

    await db.insert(tables.commits).values({
      content: "some commit content",
      oid: "some-commit-oid",
      blobMap: JSON.stringify({
        "content/movie1.json": "blob-oid-1",
        "content/movie2.json": "blob-oid-2",
      }),
    });

    const firstCommit = await db.query.commits.findFirst();
    if (!firstCommit) {
      throw new Error(`Unable to find a commit`);
    }
    const blobMap = JSON.parse(firstCommit?.blobMap);

    await db.insert(tables.branches).values({
      commit: "some-commit-oid",
      name: "main",
      org: "jeffsee55",
      repoName: "movie-content",
    });

    for await (const [path, oid] of Object.entries(blobMap)) {
      if (typeof oid !== "string") {
        throw new Error(
          `Expected oid to be a string in tree map for path ${path}`
        );
      }
      await db.insert(tables.blobs).values({
        oid,
        // mocking content
        content: `${oid}-content`,
      });

      await db.insert(tables.blobsToBranches).values({
        blobOid: oid,
        path: path,
        org: "jeffsee55",
        repoName: "movie-content",
        branchName: "main",
      });
    }

    const result = await db.query.repos.findFirst({
      with: {
        branches: {
          with: {
            blobsToBranches: {
              with: {
                blob: true,
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
      "queries/1.json"
    );

    // Begin "UPDATE" operation

    const newTreeMapItems = {
      "content/movie2.json": "blob-oid-3",
    };
    const treeMap2 = {
      ...blobMap,
      ...newTreeMapItems,
    };
    await db.insert(tables.commits).values({
      content: "some commit content 2",
      oid: "some-commit-oid-2",
      blobMap: JSON.stringify(treeMap2),
    });

    for await (const [path, oid] of Object.entries(newTreeMapItems)) {
      if (typeof oid !== "string") {
        throw new Error(
          `Expected oid to be a string in tree map for path ${path}`
        );
      }
      await db.insert(tables.blobs).values({
        oid,
        // mocking content
        content: `${oid}-content`,
      });

      await db.insert(tables.blobsToBranches).values({
        blobOid: oid,
        path: path,
        org: "jeffsee55",
        repoName: "movie-content",
        branchName: "main",
      });
      await db
        .delete(tables.blobsToBranches)
        .where(
          and(
            eq(tables.blobsToBranches.path, path),
            eq(tables.blobsToBranches.branchName, "main"),
            not(eq(tables.blobsToBranches.blobOid, oid))
          )
        );
    }

    await db
      .update(tables.branches)
      .set({ commit: "some-commit-oid-2" })
      .where(
        and(
          eq(tables.branches.org, "jeffsee55"),
          eq(tables.branches.repoName, "movie-content"),
          eq(tables.branches.name, "main")
        )
      );

    // end "UPDATE" operation

    const result2 = await db.query.repos.findFirst({
      with: {
        branches: {
          with: {
            blobsToBranches: {
              with: {
                blob: true,
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(result2, null, 2)).toMatchFileSnapshot(
      "queries/2.json"
    );

    const result3 = await db.query.repos.findFirst({
      with: {
        branches: {
          with: {
            blobsToBranches: {
              where: (fields, ops) =>
                ops.eq(fields.path, "content/movie2.json"),
              with: {
                blob: true,
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(result3, null, 2)).toMatchFileSnapshot(
      "queries/3.json"
    );
  });
});
