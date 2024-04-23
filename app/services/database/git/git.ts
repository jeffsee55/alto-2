import { exec } from "child_process";
import fs from "fs";
import path from "path";
import * as git from "isomorphic-git";
import { ENOENT } from "./fs";
import { Database } from "..";
import { schema } from "../schema";

export class GitExec {
  database: Database;
  constructor(database: Database) {
    this.database = database;
  }

  async clone({ ref, dir }: { ref: string; dir: string }) {
    const stdout = await this.lsTree({ ref, dir });
    const oid = await git.resolveRef({ fs, dir, ref: ref });
    const commit = await git.readCommit({ fs: fs, dir, oid });
    const commitCompressed = await this.writeCommit({
      commit,
      dir,
    });

    const treeResult = await this.buildTree2({
      stdout,
      topLevelSha: commit.commit.tree,
      dir: dir,
    });

    const shaTree: Record<string, string> = {};
    for await (const [treeSha, entries] of Object.entries(treeResult.trees)) {
      shaTree[treeSha] = await this.writeTree({
        expectedSha: treeSha,
        entryShas: entries,
        dir,
      });
    }

    const sha = await this.getShaForRef({ ref, dir });
    await this.database._db.insert(schema.trees).values({
      sha,
      content: JSON.stringify(treeResult.tree),
      commit: commitCompressed,
      shaTree: JSON.stringify(shaTree),
    });
    for await (const [sha, filepath] of Object.entries(treeResult.blobMap)) {
      if (filepath.endsWith("json") || filepath.endsWith("md")) {
        const value = await this.readBlobFromSha({
          sha: sha,
          dir,
        });
        const size = Buffer.byteLength(value, "utf8");
        const { dir: pDir, base } = path.parse(filepath);
        const birthtime = 1706724530491;
        const encoding = "utf8";
        await this.database._db.insert(schema.files).values({
          repoId: dir,
          name: filepath,
          value: value,
          isDirectory: 0,
          base,
          dir: pDir,
          birthtime,
          size,
          encoding,
        });
      }
    }
  }

  getShaForRef({ ref, dir }: { ref: string; dir: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      // Execute git rev-parse command to get the SHA hash for the reference
      exec(`git rev-parse ${ref}`, { cwd: dir }, (error, stdout, stderr) => {
        if (error) {
          reject(stderr || error.message);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  async readBlobFromSha({
    sha,
    dir,
  }: {
    sha: string;
    dir: string;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      // Execute git show command to read the blob content from the SHA
      // console.log("shiw", sha);
      exec(
        `git show ${sha}`,
        { cwd: dir, maxBuffer: 1024 * 5000 },
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

  async lsTree({ ref, dir }: { ref: string; dir: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        `git ls-tree ${ref} -r -t`,
        { cwd: dir, maxBuffer: 1024 * 5000 },
        async (error, stdout, stderr) => {
          if (error) {
            reject(`Error listing branches: ${error}`);
            return;
          }
          if (stderr) {
            reject(`Git stderr: ${stderr}`);
            return;
          }
          resolve(stdout);
        }
      );
    });
  }

  async writeTree({
    expectedSha,
    entryShas,
    dir,
  }: {
    expectedSha: string;
    entryShas: {
      mode: string;
      path: string;
      oid: string;
      type: "tree" | "blob";
    }[];
    dir: string;
  }) {
    let buffer = "";
    await git.writeTree({
      tree: entryShas,
      fs: {
        promises: {
          ...fs.promises,
          stat: async (...args: Parameters<typeof fs.promises.stat>) => {
            throw new ENOENT(args[0].toString());
          },
          lstat: async (...args: Parameters<typeof fs.promises.lstat>) => {
            throw new ENOENT(args[0].toString());
          },
          writeFile: async (...args: Parameters<typeof fs.promises.lstat>) => {
            const outputSha = args[0]
              .toString()
              .split(".git/objects/")[1]
              .replace("/", "");
            if (expectedSha !== outputSha) {
              console.log("`unmatched tree", expectedSha, outputSha);
              console.dir(entryShas, { depth: null });
            }
            if (args[1] instanceof Buffer) {
              buffer = args[1]?.toString("base64");
            }
          },
        },
      },
      dir,
    });
    return buffer;
  }

  async buildTree2({
    stdout,
    // lines,
    topLevelSha,
    dir,
  }: {
    stdout: string;
    topLevelSha: string;
    dir: string;
  }) {
    const lines = stdout.trim().split("\n");
    const jsonLines: ObjectInfo[] = [];
    lines.forEach((line) => {
      const [mode, type, rest] = line.split(" ");
      const [sha, filepath] = rest.split("\t");
      if (type === "blob" || type === "tree") {
        jsonLines.push({ mode, type, sha, filepath });
      }
    });
    const treeMap: Record<string, string> = {};
    const blobMap: Record<string, string> = {};
    const topLevelTree: TreeNode = {
      mode: "040000",
      type: "tree",
      sha: topLevelSha,
      filepath: ".",
      entries: {},
    };
    const trees: Record<
      string,
      {
        mode: string;
        type: "tree" | "blob";
        oid: string;
        path: string;
      }[]
    > = { [topLevelSha]: [] };
    jsonLines.forEach((line) => {
      let currentTree = topLevelTree;
      const pathParts = line.filepath.split("/");
      pathParts.map((part, i) => {
        if (i === pathParts.length - 1) {
          // we'r at the end
          const value = {
            ...line,
            relativePath: part,
          };
          const valueWithEntries =
            line.type === "tree" ? { ...value, entries: {} } : value;
          if (currentTree.entries) {
            currentTree.entries[part] = valueWithEntries;
          }

          if (line.type === "tree") {
            trees[line.sha] = [];
          }
          if (line.type === "blob") {
            blobMap[line.sha] = line.filepath;
          }
          trees[currentTree.sha].push({
            mode: line.mode,
            path: part,
            oid: line.sha,
            type: line.type,
          });
        } else {
          if (currentTree.entries) {
            if (part in currentTree.entries) {
              currentTree = currentTree?.entries[part];
            }
          }
        }
      });
    });
    // console.dir(trees, { depth: null });
    for await (const [expectedSha, entryShas] of Object.entries(trees)) {
      treeMap[expectedSha] = await this.writeTree({
        dir,
        expectedSha,
        entryShas,
      });
    }
    return { tree: topLevelTree, trees, treeMap, blobMap };
  }
  async writeCommit({
    commit,
    dir,
  }: {
    dir: string;
    commit: {
      commit: {
        parent: string[];
        author: {
          name: string;
          email: string;
          timestamp: number;
          timezoneOffset: number;
          tree: string;
        };
        committer: {
          name: string;
          email: string;
          timestamp: number;
          timezoneOffset: number;
          tree: string;
        };
        message: string;
        tree: string;
      };
    };
  }) {
    let commitCompressed: string = "";

    await git.writeCommit({
      commit: {
        ...commit.commit,
        message: commit.commit.message.trim(),
      },
      fs: {
        promises: {
          ...fs.promises,
          stat: async (...args: Parameters<typeof fs.promises.stat>) => {
            throw new ENOENT(args[0].toString());
          },
          lstat: async (...args: Parameters<typeof fs.promises.lstat>) => {
            throw new ENOENT(args[0].toString());
          },
          writeFile: async (
            ...args: Parameters<typeof fs.promises.writeFile>
          ) => {
            if (args[1] instanceof Buffer) {
              commitCompressed = args[1].toString("base64");
            }
          },
        },
      },
      dir: dir,
    });
    return commitCompressed;
  }
}

interface ObjectInfo {
  mode: string;
  type: "tree" | "blob";
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
