import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import { schema, tables } from "./schema";
import { and, eq, not } from "drizzle-orm";
import * as git from "isomorphic-git";
import {} from "isomorphic-git";
import fs from "fs";
import { exec } from "child_process";
import { sep } from "path";
import crypto from "crypto";

type DB = BetterSQLite3Database<typeof schema>;

export class GitExec {
  cache: Record<string, unknown> = {};
  orgName: string;
  repoName: string;
  dir: string;
  db: BetterSQLite3Database<typeof schema>;

  constructor(args: {
    orgName: string;
    repoName: string;
    localPath: string;
    db: BetterSQLite3Database<typeof schema>;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.dir = args.localPath;
  }

  static async hashBlob(content: string) {
    const { oid } = await git.hashBlob({
      object: content,
    });
    return oid;
  }

  async writeBlob(args: { path: string; oid: string; branchName: string }) {
    const content = await this.readBlob(args.oid);

    await this.db
      .insert(tables.blobs)
      .values({
        oid: args.oid,
        content,
      })
      .onConflictDoNothing();

    await this.db.insert(tables.blobsToBranches).values({
      blobOid: args.oid,
      path: args.path,
      orgName: this.orgName,
      repoName: this.repoName,
      branchName: args.branchName,
    });
  }

  static updateTree(args: { tree: TreeType; path: string; blobOid: string }) {
    const pathParts = args.path.split(sep);
    let currentEntry = args.tree;
    pathParts.forEach((part) => {
      const entry = currentEntry.entries[part];
      if (!entry) throw new Error(`Unable to find entry for path ${args.path}`);

      if (entry.type === "blob") {
        currentEntry.entries[part] = {
          type: "blob",
          mode: "100644",
          oid: args.blobOid,
          name: part,
        };
      } else {
        currentEntry = entry;
      }
    });
    return args.tree;
  }

  static removeFromTree(args: { tree: TreeType; path: string }) {
    const pathParts = args.path.split(sep);
    let currentEntry = args.tree;
    pathParts.forEach((part) => {
      const entry = currentEntry.entries[part];
      if (!entry) throw new Error(`Unable to find entry for path ${args.path}`);

      if (entry.type === "blob") {
        delete currentEntry.entries[part];
      } else {
        currentEntry = entry;
      }
    });
    return args.tree;
  }

  static async getCommitForBranch(args: { branch: string; dir: string }) {
    const commitOid = await git.resolveRef({
      fs,
      dir: args.dir,
      ref: args.branch,
    });

    if (typeof commitOid !== "string") {
      throw new Error(`Expected commit oid to be a string, got ${commitOid}`);
    }

    const commit = await git.readCommit({
      fs,
      dir: args.dir,
      oid: commitOid,
    });
    return commit;
  }

  static async buildCommitTree(args: {
    branch: string;
    dir: string;
  }): Promise<TreeType> {
    const dir = args.dir;
    const ref = args.branch || "main";
    const lsTree = await GitExec._lsTree({ ref, dir });
    const commitInfo = await GitExec.getCommitForBranch({
      branch: ref,
      dir: dir,
    });

    if (typeof lsTree === "string") {
      const lines = lsTree.split("\n");

      const tree: TreeType = {
        type: "tree",
        mode: "040000",
        oid: commitInfo.commit.tree,
        name: ".",
        entries: {},
      };

      lines.forEach((lineString) => {
        const [, type, oidAndPath] = lineString.split(" ");
        if (oidAndPath) {
          const [oid, filepath] = oidAndPath.split("\t");
          const pathParts = filepath.split(sep);
          const lastPart = pathParts[pathParts.length - 1];
          let currentTree = tree.entries;
          pathParts.forEach((part, i) => {
            if (i === pathParts.length - 1) {
              if (type === "tree") {
                currentTree[part] = {
                  type: "tree",
                  mode: "040000",
                  oid,
                  name: lastPart,
                  entries: {},
                };
              } else {
                currentTree[part] = {
                  type: "blob",
                  mode: "100644",
                  oid,
                  name: lastPart,
                };
              }
            } else {
              const next = currentTree[part];
              if (next.type === "tree") {
                currentTree = next.entries;
              }
            }
          });
        }
      });
      return tree;
    } else {
      throw new Error(`Unexepcted response from ls-tree for ref ${ref}`);
    }
  }

  static async buildCommitHash(args: {
    message: string;
    tree: TreeType;
    dir: string;
  }) {
    const tree = args.tree;
    const buildTree = async (tree: TreeType) => {
      const entries: { type: "tree" | "blob"; oid: string; name: string }[] =
        [];
      for await (const [name, entry] of Object.entries(tree.entries)) {
        if (entry.type === "tree") {
          const oid = await buildTree(entry);
          entries.push({ type: "tree", oid, name });
        } else {
          entries.push({ type: "blob", oid: entry.oid, name });
        }
      }
      const buffer = Buffer.concat(
        entries.map((entry) => {
          z.object({
            type: z.enum(["blob", "tree"]),
            oid: z.string(),
            name: z.string(),
          }).parse(entry);
          const mode =
            entry.type === "blob"
              ? Buffer.from("100644")
              : Buffer.from("40000"); // we store is as 040000 for legibility
          const space = Buffer.from(" ");
          const path = Buffer.from(entry.name, "utf8");
          const nullchar = Buffer.from([0]);
          const oid = Buffer.from(entry.oid, "hex");
          return Buffer.concat([mode, space, path, nullchar, oid]);
        })
      );
      const wrapped = Buffer.concat([
        Buffer.from("tree "),
        Buffer.from(buffer.length.toString()),
        Buffer.from([0]),
        buffer,
      ]);
      const result2 = crypto.createHash("sha1").update(wrapped).digest("hex");
      // Uncomment to check against the isomorphic-git implementation
      // const isoResult = await git.writeTree({
      //   fs,
      //   dir: "some-dir",
      //   tree: Object.values(tree.entries).map((e) => ({
      //     mode: e.mode,
      //     path: e.name,
      //     oid: e.oid,
      //     type: e.type,
      //   })),
      // });
      // if (isoResult !== result2) {
      //   console.log("hmmm", tree.name);
      // }
      return result2;
    };
    const res = await buildTree(tree);

    return res;
  }

  async clone(args: { branchName: string }) {
    const commitInfo = await GitExec.getCommitForBranch({
      branch: args.branchName,
      dir: this.dir,
    });

    /**
     * When we're not working locally, we'll first need to clone into
     * a temp dir, and set that value to the localPath
     */
    const cloneResult = {
      branchName: args.branchName,
      commit: {
        content: commitInfo.commit.message,
        oid: commitInfo.oid,
      },
    };
    return cloneResult;
  }

  static async _lsTree({ ref, dir }: { ref: string; dir: string }) {
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

  async readBlob(oid: string) {
    // Skipping unnecessary sha lookup
    // this is extremely fast when the objects are coming from a
    // pack file because the cache holds them in memory
    const res = await git.readObject({
      fs,
      dir: this.dir,
      oid,
      cache: this.cache,
    });
    if (!res) {
      throw new Error(`Unable to read blob with oid ${oid}`);
    }
    if (res.object instanceof Uint8Array) {
      return Buffer.from(res.object).toString("utf8");
    } else {
      throw new Error(`Unknown error occurred while reading blob ${res.oid}.`);
    }
  }
}

export class Repo {
  orgName: string;
  repoName: string;
  localPath: string;
  db: BetterSQLite3Database<typeof schema>;

  constructor(args: {
    orgName: string;
    repoName: string;
    localPath: string;
    db: BetterSQLite3Database<typeof schema>;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.localPath = args.localPath;
  }

  static async clone(args: {
    orgName: string;
    repoName: string;
    /**
     * The path to the Git repo on your machine, if no path
     * is provided, a clone will be performed and stored
     * into a temporary directory
     */
    localPath: string;
    db: BetterSQLite3Database<typeof schema>;
    branchName: string;
  }) {
    const repo = new Repo(args);
    await repo.initialize();
    const gitExec = new GitExec(args);
    const cloneResult = await gitExec.clone({ branchName: args.branchName });
    const firstCommit = await repo.createCommit(cloneResult);
    const branch = await repo.createBranch({
      branchName: args.branchName,
      commit: await firstCommit.oid(),
    });
    await branch.createBlobs();
    return repo;
  }

  async initialize() {
    await this.db
      .insert(tables.repos)
      .values({ orgName: this.orgName, repoName: this.repoName });
  }
  async createBranch({
    branchName,
    commit,
  }: {
    branchName: string;
    commit: string;
  }) {
    const branch = new Branch({
      db: this.db,
      repoName: this.repoName,
      orgName: this.orgName,
      branchName,
      commit: commit,
      localPath: this.localPath,
    });
    await branch.save();
    return branch;
  }

  async getBranch(args: { branchName: string }) {
    const branchRecord = await this.db.query.branches.findFirst({
      where: (fields, ops) =>
        ops.and(
          ops.eq(fields.branchName, args.branchName),
          ops.eq(fields.orgName, this.orgName),
          ops.eq(fields.repoName, this.repoName)
        ),
    });
    if (!branchRecord) {
      throw new Error(
        `Unable to find database record for branch branch ${args.branchName}, in repo ${this.orgName}:${this.repoName}`
      );
    }
    return Branch.fromRecord({
      ...branchRecord,
      db: this.db,
      name: args.branchName,
      repoName: this.repoName,
      orgName: this.orgName,
      localPath: this.localPath,
    });
  }

  async createCommit(args: {
    branchName: string;
    commit: { content: string; oid: string };
  }) {
    const commit = new Commit({
      db: this.db,
      repoName: this.repoName,
      orgName: this.orgName,
      ...args.commit,
      message: args.commit.content,
      localPath: this.localPath,
      tree: await GitExec.buildCommitTree({
        branch: args.branchName,
        dir: this.localPath,
      }),
    });
    await commit.save();
    return commit;
  }
}

export class Branch {
  orgName: string;
  repoName: string;
  db: BetterSQLite3Database<typeof schema>;
  branchName: string;
  commitOid: string;
  localPath: string;

  constructor(args: {
    orgName: string;
    repoName: string;
    db: BetterSQLite3Database<typeof schema>;
    branchName: string;
    commit: string;
    localPath: string;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.branchName = args.branchName;
    this.commitOid = args.commit;
    this.localPath = args.localPath;
  }

  static fromRecord(value: {
    name: string;
    orgName: string;
    db: BetterSQLite3Database<typeof schema>;
    localPath: string;
    commit: string;
    repoName: string;
  }) {
    return new Branch({
      branchName: value.name,
      orgName: value.orgName,
      db: value.db,
      commit: value.commit,
      repoName: value.repoName,
      localPath: value.localPath,
    });
  }

  async list() {
    const result = await this.db.query.repos.findFirst({
      with: {
        branches: {
          with: {
            blobsToBranches: {
              with: {
                blob: true,
              },
              limit: 10,
            },
          },
        },
      },
    });
    return result;
  }

  async find(args: { path: string }) {
    const result = await this.db.query.repos.findFirst({
      with: {
        branches: {
          with: {
            blobsToBranches: {
              where: (fields, ops) => ops.eq(fields.path, args.path),
              with: {
                blob: true,
              },
            },
          },
        },
      },
    });
    return result;
  }

  async delete(args: { path: string }) {
    const currentCommit = await this.currentCommit();

    const tree = currentCommit.tree;
    GitExec.removeFromTree({ tree, path: args.path });

    const commit = new Commit({
      orgName: this.orgName,
      repoName: this.repoName,
      db: this.db,
      message: `Deleted ${args.path}`,
      localPath: this.localPath,
      tree: tree,
    });

    await commit.save();

    await this.db
      .delete(tables.blobsToBranches)
      .where(
        and(
          eq(tables.blobsToBranches.path, args.path),
          eq(tables.blobsToBranches.branchName, this.branchName)
        )
      );

    await this.db
      .update(tables.branches)
      .set({ commit: await commit.oid() })
      .where(
        and(
          eq(tables.branches.orgName, this.orgName),
          eq(tables.branches.repoName, this.repoName),
          eq(tables.branches.branchName, this.branchName)
        )
      );
  }

  async upsert(args: { path: string; content: string }) {
    // It's important that this instance isn't kept around,
    // since we're mutating the tree in-place for
    // performance reasons
    const currentCommit = await this.currentCommit();

    const blobOid = await GitExec.hashBlob(args.content);

    const tree = currentCommit.tree;
    GitExec.updateTree({ blobOid, tree, path: args.path });

    const commit = new Commit({
      orgName: this.orgName,
      repoName: this.repoName,
      db: this.db,
      message: `Autosave of ${args.path}`,
      localPath: this.localPath,
      tree: tree,
    });
    await commit.save();

    if (typeof blobOid !== "string") {
      throw new Error(
        `Expected oid to be a string in tree map for path ${args.path}`
      );
    }
    await this.db
      .insert(tables.blobs)
      .values({
        oid: blobOid,
        content: args.content,
      })
      .onConflictDoNothing();

    await this.db.insert(tables.blobsToBranches).values({
      blobOid: blobOid,
      path: args.path,
      orgName: this.orgName,
      repoName: this.repoName,
      branchName: this.branchName,
    });
    await this.db
      .delete(tables.blobsToBranches)
      .where(
        and(
          eq(tables.blobsToBranches.path, args.path),
          eq(tables.blobsToBranches.branchName, this.branchName),
          not(eq(tables.blobsToBranches.blobOid, blobOid))
        )
      );

    await this.db
      .update(tables.branches)
      .set({ commit: await commit.oid() })
      .where(
        and(
          eq(tables.branches.orgName, "jeffsee55"),
          eq(tables.branches.repoName, "movie-content"),
          eq(tables.branches.branchName, "main")
        )
      );
    this.commitOid = await commit.oid();

    return { [args.path]: blobOid };
  }

  async save() {
    await this.db.insert(tables.branches).values({
      commit: this.commitOid,
      branchName: this.branchName,
      orgName: this.orgName,
      repoName: this.repoName,
    });
  }

  async getRecord() {
    const branchRecord = await this.db.query.branches.findFirst({
      where: (fields, ops) => ops.eq(fields.branchName, this.branchName),
    });
    if (!branchRecord) {
      throw new Error(
        `Unable to find database record for branch ${this.branchName}, in repo ${this.orgName}:${this.repoName}`
      );
    }
    return branchRecord;
  }

  async currentCommit() {
    const branchRecord = await this.getRecord();
    const commitRecord = await this.db.query.commits.findFirst({
      where: (fields, ops) => ops.eq(fields.oid, branchRecord.commit),
    });
    if (!commitRecord) {
      throw new Error(
        `Unable to find database record for commit with oid ${branchRecord.commit} of branch ${this.branchName}, in repo ${this.orgName}:${this.repoName}`
      );
    }

    return Commit.fromRecord({
      repoName: this.repoName,
      orgName: this.orgName,
      db: this.db,
      localPath: this.localPath,
      ...commitRecord,
    });
  }

  async createBlobs() {
    const currentCommit = await this.currentCommit();

    const gitExec = new GitExec({
      db: this.db,
      repoName: this.repoName,
      orgName: this.orgName,
      localPath: this.localPath,
    });

    const walkTree = async (tree: TreeType, parentPath?: string) => {
      for await (const [name, entry] of Object.entries(tree.entries)) {
        const path = `${parentPath ?? ""}${parentPath ? sep : ""}${name}`;
        if (entry.type === "tree") {
          await walkTree(entry, path);
        } else {
          if (path.endsWith(".json") || path.endsWith(".md")) {
            await gitExec.writeBlob({
              branchName: this.branchName,
              oid: entry.oid,
              path: path,
            });
          }
        }
      }
    };
    await walkTree(currentCommit.tree);
  }
}

export class Commit {
  orgName: string;
  repoName: string;
  db: BetterSQLite3Database<typeof schema>;

  content: string;
  tree: TreeType;
  localPath: string;

  constructor(args: {
    orgName: string;
    repoName: string;
    db: BetterSQLite3Database<typeof schema>;
    message: string;
    localPath: string;
    tree: TreeType;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.content = args.message;
    this.localPath = args.localPath;
    this.tree = args.tree;
  }

  static fromRecord(value: {
    repoName: string;
    orgName: string;
    db: DB;
    content: string;
    oid: string;
    tree: string;
    localPath: string;
  }) {
    const tree = z.record(z.any()).parse(JSON.parse(value.tree)) as TreeType; // FIXME: Dont cast this
    return new Commit({
      repoName: value.repoName,
      orgName: value.orgName,
      db: value.db,
      message: value.content,
      localPath: value.localPath,
      tree: tree,
    });
  }

  async oid() {
    const oid = await GitExec.buildCommitHash({
      message: this.content,
      dir: this.localPath,
      tree: this.tree,
    });
    return oid;
  }

  async save() {
    const oid = await this.oid();
    await this.db.insert(tables.commits).values({
      content: this.content,
      oid,
      tree: JSON.stringify(this.tree),
    });
  }
}

// Current the these types are more verbose than they need to be
// at some scale it might make sense to omit `mode` and `oid`
// since mode can be inferred and oid is likely being changed
// depending on what type of operation is being performed
type TreeType = {
  type: "tree";
  mode: "040000";
  name: string;
  oid: string;
  entries: Record<string, TreeType | BlobType>;
};
type BlobType = {
  type: "blob";
  mode: "100644";
  oid: string;
  name: string;
};
