import { describe, expect, it } from "vitest";
import SQLiteDatabase from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { schema, tables } from "~/services/git/schema";
import tmp from "tmp-promise";

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
    const { db, pathToGitRepo } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
      // repoPath: largeRepoPath,
    });
    const ref = "main";

    await db
      .insert(tables.repos)
      .values({ org: "jeffsee55", name: "movie-content" });

    await db.insert(tables.commits).values({
      content: "some commit content",
      oid: "some-commit-oid",
      tree: JSON.stringify({ someCrazy: "tree" }),
    });

    await db.insert(tables.refs).values({
      commit: "some-commit-oid",
      name: "main",
      org: "jeffsee55",
      repoName: "movie-content",
    });

    await db.insert(tables.blobs).values({
      oid: "some-blob-oid",
      content: "some-blob-content",
    });

    await db.insert(tables.blobs).values({
      oid: "some-other-blob-oid",
      content: "some-other-blob-content",
    });

    await db.insert(tables.blobsToRefs).values({
      blobOid: "some-blob-oid",
      path: "content/movie1.json",
      org: "jeffsee55",
      repoName: "movie-content",
      refName: "main",
    });

    await db.insert(tables.blobsToRefs).values({
      blobOid: "some-other-blob-oid",
      org: "jeffsee55",
      path: "content/movie2.json",
      repoName: "movie-content",
      refName: "main",
    });

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
