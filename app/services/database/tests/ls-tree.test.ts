import { describe, expect, it } from "vitest";
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

describe(
  "clone",
  () => {
    it(
      "works",
      async () => {
        const { database, pathToGitRepo } = await setup({
          sqliteUrl: TEST_SQLITE,
          repoPath: largeRepoPath,
        });
        const ref = "master";
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

        function organizeObjectsIntoTree(
          objects: ObjectInfo[],
          topLevelTreeSha: string
        ) {
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
              const entries = Object.values(node?.entries || {}).map(
                (entry) => ({
                  mode: entry.mode,
                  path: getLastPart(entry.filepath),
                  oid: entry.sha,
                  type: entry.type,
                })
              );
              if (entries.length) {
                if (node.sha === "0b1f773ba4978480b4932d2542b319603b0f8e50") {
                  console.log("hi", entries.length);
                }
                trees[node.sha] = { filepath: node.filepath, entries };
              }
            }
          }

          // Iterate through each object
          objects.forEach((object) => {
            const parts = object.filepath.split("/");
            buildTree(tree, parts, object);
          });
          const entries = Object.values(tree.entries || {}).map((entry) => ({
            mode: entry.mode,
            path: getLastPart(entry.filepath),
            oid: entry.sha,
            type: entry.type,
          }));
          trees[topLevelTreeSha] = { filepath: ".", entries };
          return { tree, blobs, trees };
        }

        function listGitBranches(cwd: string) {
          let commitCompressed = "";
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
                const oid = await git.resolveRef({ fs, dir: cwd, ref: ref });
                const commit = await git.readCommit({ fs: fs, dir: cwd, oid });
                console.log("commit found");
                console.log({ ref, oid, message: commit.commit.message });
                await git.writeCommit({
                  commit: {
                    ...commit.commit,
                    message: commit.commit.message.trim(),
                  },
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
                        commitCompressed = args[1].toString("base64");
                      },
                    },
                  },
                  dir: cwd,
                });

                const lines = stdout.trim().split("\n");

                console.log("tree list length:", lines.length);

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
                const { tree, blobs, trees } = organizeObjectsIntoTree(
                  jsonLines,
                  commit.commit.tree
                );

                const shaTree = {};
                // console.log(trees);
                // console.log(trees);
                // const topLevel = {}
                // trees[commit.commit.tree] = {entries: []}
                for await (const [treeSha, info] of Object.entries(trees)) {
                  const entries = info.entries;
                  // console.log(entries);
                  let treeCompressed = "";
                  await git.writeTree({
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
                            console.log("`unmatched tree", treeSha, outputSha);
                            throw new Error(
                              `Unmatched tree`,
                              treeSha,
                              outputSha
                            );
                          }
                          treeCompressed = args[1].toString("base64");
                          shaTree[treeSha] = treeCompressed;
                        },
                      },
                    },
                    dir: cwd,
                  });
                }
                console.log("tree built, writing to trees table", sha);

                const sha = await getShaForRef(ref);
                await database._db.insert(schema.trees).values({
                  sha,
                  content: JSON.stringify(tree),
                  commit: commitCompressed,
                  shaTree: JSON.stringify(shaTree),
                });
                console.log("processing text files");
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
                console.log("done processing files");

                // Output the tree structure
                // console.dir(blobs, { depth: null });

                resolve(stdout);
              }
            );
          });
        }

        console.log("cloning...");
        await listGitBranches(pathToGitRepo);
        console.log("listing files...");
        console.time("listFiles");
        const files = await database.git.repo(pathToGitRepo).listFiles({ ref });
        console.log(files.length);
        console.timeEnd("listFiles");
        // expect(JSON.stringify(files, null, 2)).toMatchFileSnapshot(
        //   "clone-and-list.json"
        // );
      },
      { timeout: 150000 }
    );
    // about 60000 being used right now
    // { timeout: 150000 }
  },
  {}
);

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
// trees[node.sha] = node.entries;
function getLastPart(filepath: string): string {
  // Split the filepath by '/' and get the last part
  const parts = filepath.split("/");
  return parts[parts.length - 1];
}
