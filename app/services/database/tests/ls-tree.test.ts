import { describe, it } from "vitest";
import * as git from "isomorphic-git";
import fs from "fs";
import path from "path";
import SQLiteDatabase from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Database } from "~/services/database";
import { schema } from "~/services/database/schema";
import { exec } from "child_process";
import tmp from "tmp-promise";
import { ENOENT } from "../git/fs";

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
  const drizzleDB = drizzle(sqlite, { schema: schema });
  const database = new Database(drizzleDB);
  if (args.sqliteUrl === ":memory:") {
    await migrate(drizzleDB, { migrationsFolder: "./drizzle.test" });
  }
  if (!args.preventReset) {
    await database.reset();
  }
  return {
    database,
    pathToGitRepo,
  };
};

describe("clone", () => {
  it("works", async () => {
    const { database, pathToGitRepo } = await setup({
      sqliteUrl: TEST_SQLITE,
      repoPath: movieRepoPath,
    });
    const ref = "main";
    const cwd = pathToGitRepo;

    function readBlobFromSha(sha: string): Promise<string> {
      return new Promise((resolve, reject) => {
        // Execute git show command to read the blob content from the SHA
        // console.log("shiw", sha);
        exec(
          `git show ${sha}`,
          { cwd, maxBuffer: 1024 * 5000 },
          (error, stdout, stderr) => {
            if (error) {
              reject(stderr || error.message);
            } else {
              resolve(stdout);
            }
          }
        );
      });
    }

    function getShaForRef(ref: string): Promise<string> {
      return new Promise((resolve, reject) => {
        // Execute git rev-parse command to get the SHA hash for the reference
        exec(`git rev-parse ${ref}`, { cwd }, (error, stdout, stderr) => {
          if (error) {
            reject(stderr || error.message);
          } else {
            resolve(stdout.trim());
          }
        });
      });
    }

    function organizeObjectsIntoTree(objects: ObjectInfo[]) {
      const blobs: Record<string, string> = {};
      const trees: Record<string, string> = {};
      const tree: TreeNode = {
        mode: "",
        type: "",
        sha: "",
        filepath: "",
        entries: {},
      };

      // Function to recursively build the tree
      function buildTree(
        node: TreeNode,
        parts: string[],
        object: ObjectInfo
      ): void {
        let done = false;
        const currentPart = parts.shift()!;

        if (object.type === "blob") {
          blobs[object.sha] = object.filepath;
        }

        if (parts.length === 0) {
          // If it's the last part (file), add it to the node's entries
          if (!node.entries) {
            node.entries = {};
          }
          node.entries[currentPart] = object;
          done = true;
        }

        if (!done) {
          if (!node.entries![currentPart]) {
            // Create a new node for the directory
            const newNode: TreeNode = {
              mode: "",
              type: "",
              sha: "",
              filepath: "",
              entries: {},
            };
            node.entries![currentPart] = newNode;
          }

          // Continue recursively building the tree
          buildTree(node.entries![currentPart] as TreeNode, parts, object);
        }

        if (node.type === "tree") {
          // trees[node.sha] = node.entries;
          function getLastPart(filepath: string): string {
            // Split the filepath by '/' and get the last part
            const parts = filepath.split("/");
            return parts[parts.length - 1];
          }
          const entries = Object.values(node?.entries || {}).map((entry) => ({
            mode: entry.mode,
            path: getLastPart(entry.filepath),
            oid: entry.sha,
            type: entry.type,
          }));
          if (entries.length) {
            trees[node.sha] = { filepath: node.filepath, entries };
          }
        }
      }

      // Iterate through each object
      objects.forEach((object) => {
        const parts = object.filepath.split("/");
        buildTree(tree, parts, object);
      });

      return { tree, blobs, trees };
    }

    function listGitBranches(cwd: string) {
      return new Promise((resolve, reject) => {
        exec(
          `git ls-tree ${ref} -r -t`,
          { cwd, maxBuffer: 1024 * 5000 },
          async (error, stdout, stderr) => {
            if (error) {
              reject(`Error listing branches: ${error}`);
              return;
            }
            if (stderr) {
              reject(`Git stderr: ${stderr}`);
              return;
            }

            const lines = stdout.trim().split("\n");

            // const line = lines[0];
            // const [mode, type, rest] = line.split(" ");
            // const [sha, filepath] = rest.split("\t");
            // console.log({ mode, type, sha, filepath });
            const jsonLines: ObjectInfo[] = [];
            lines.forEach((line) => {
              const [mode, type, rest] = line.split(" ");
              const [sha, filepath] = rest.split("\t");
              jsonLines.push({ mode, type, sha, filepath });
            });
            const { tree, blobs, trees } = organizeObjectsIntoTree(jsonLines);

            const shaTree = {};
            for await (const [treeSha, info] of Object.entries(trees)) {
              const entries = info.entries;
              let treeCompressed = "";
              const treeSha2 = await git.writeTree({
                tree: entries,
                fs: {
                  promises: {
                    ...fs.promises,
                    stat: async (
                      ...args: Parameters<typeof fs.promises.stat>
                    ) => {
                      throw new ENOENT(args[0]);
                    },
                    lstat: async (
                      ...args: Parameters<typeof fs.promises.lstat>
                    ) => {
                      throw new ENOENT(args[0]);
                    },
                    writeFile: async (...args) => {
                      const outputSha = args[0]
                        .split(".git/objects/")[1]
                        .replace("/", "");
                      if (treeSha !== outputSha) {
                        throw new Error(`Unmatched tree`);
                      }
                      treeCompressed = args[1].toString();
                      shaTree[treeSha] = treeCompressed;
                    },
                  },
                },
                dir: cwd,
              });
            }

            const sha = await getShaForRef(ref);
            await database._db.insert(schema.trees).values({
              sha,
              content: JSON.stringify(tree),
              shaTree: JSON.stringify(shaTree),
            });
            for await (const [sha, filepath] of Object.entries(blobs)) {
              if (filepath.endsWith("json") || filepath.endsWith("md")) {
                const value = await readBlobFromSha(sha);
                const size = Buffer.byteLength(value, "utf8");
                const { dir, base } = path.parse(filepath);
                const birthtime = 1706724530491;
                const encoding = "utf8";
                await database._db.insert(schema.files).values({
                  repoId: pathToGitRepo,
                  name: filepath,
                  value: value,
                  isDirectory: 0,
                  base,
                  dir,
                  birthtime,
                  size,
                  encoding,
                });
              }
            }

            // Output the tree structure
            // console.dir(blobs, { depth: null });

            resolve(stdout);
          }
        );
      });
    }

    await listGitBranches(pathToGitRepo);
    const files = await database.git.repo(pathToGitRepo).listFiles({ ref });
    // console.log(files);
  });
  // about 60000 being used right now
  // { timeout: 150000 }
});

interface ObjectInfo {
  mode: string;
  type: string;
  sha: string;
  filepath: string;
}

interface TreeNode {
  mode: string;
  type: string;
  sha: string;
  filepath: string;
  entries?: { [key: string]: TreeNode | ObjectInfo };
}
