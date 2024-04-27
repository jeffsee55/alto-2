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
      tree: JSON.stringify({
        "content/movie1.json": "blob-oid-1",
        "content/movie2.json": "blob-oid-2",
      }),
    });

    const firstCommit = await db.query.commits.findFirst();
    if (!firstCommit) {
      throw new Error(`Unable to find a commit`);
    }
    const treeMap = JSON.parse(firstCommit?.tree);

    await db.insert(tables.refs).values({
      commit: "some-commit-oid",
      name: "main",
      org: "jeffsee55",
      repoName: "movie-content",
    });

    for await (const [path, oid] of Object.entries(treeMap)) {
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

      await db.insert(tables.blobsToRefs).values({
        blobOid: oid,
        path: path,
        org: "jeffsee55",
        repoName: "movie-content",
        refName: "main",
      });
    }

    const result = await db.query.repos.findFirst({
      with: {
        refs: {
          with: {
            blobsToRefs: {
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

    const newTreeMapItems = {
      "content/movie2.json": "blob-oid-3",
    };
    const treeMap2 = {
      ...treeMap,
      ...newTreeMapItems,
    };
    await db.insert(tables.commits).values({
      content: "some commit content 2",
      oid: "some-commit-oid-2",
      tree: JSON.stringify(treeMap2),
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

      await db.insert(tables.blobsToRefs).values({
        blobOid: oid,
        path: path,
        org: "jeffsee55",
        repoName: "movie-content",
        refName: "main",
      });
      await db
        .delete(tables.blobsToRefs)
        .where(
          and(
            eq(tables.blobsToRefs.path, path),
            eq(tables.blobsToRefs.refName, "main"),
            not(eq(tables.blobsToRefs.blobOid, oid))
          )
        );
    }

    await db
      .update(tables.refs)
      .set({ commit: "some-commit-oid-2" })
      .where(
        and(
          eq(tables.refs.org, "jeffsee55"),
          eq(tables.refs.repoName, "movie-content"),
          eq(tables.refs.name, "main")
        )
      );

    const result2 = await db.query.repos.findFirst({
      with: {
        refs: {
          with: {
            blobsToRefs: {
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

    // Add
    //   await db.insert(tables.blobs).values({
    //     oid: "some-other-blob-oid-2",
    //     content: "some-other-blob-content-2",
    //   });
    //   await db.insert(tables.blobsToRefs).values({
    //     blobOid: "some-other-blob-oid-2",
    //     org: "jeffsee55",
    //     repoName: "movie-content",
    //     refName: "main",
    //   });

    //   const result2 = await db.query.repos.findFirst({
    //     with: {
    //       refs: {
    //         with: {
    //           blobsToRefs: {
    //             with: {
    //               blob: true,
    //             },
    //           },
    //         },
    //       },
    //     },
    //   });
    //   expect(JSON.stringify(result2, null, 2)).toMatchFileSnapshot(
    //     "queries/2.json"
    //   );
  });
});
