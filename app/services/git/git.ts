import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { z } from "zod";
import { schema, tables } from "./schema";
import { SQL, and, eq, not } from "drizzle-orm";
import * as git from "isomorphic-git";
import * as http from "isomorphic-git/http/node";
import fs from "fs";
import { exec } from "child_process";
import { sep, parse as pathParse } from "path";
import crypto from "crypto";
import tmp from "tmp-promise";

type DB = BetterSQLite3Database<typeof schema> | LibSQLDatabase<typeof schema>;

export const movieRepoPath = "/Users/jeffsee/code/movie-content";
// export const movieRepoPath = "/Users/jeffsee/code/movie-content-private";
// export const movieRepoConfig = {
//   orgName: "jeffsee55",
//   repoName: "movie-content-private",
// };
export const movieRepoConfig = {
  orgName: "jeffsee55",
  repoName: "movie-content",
};

export class GitExec {
  cache: Record<string, unknown> = {};
  orgName: string;
  repoName: string;
  dir: string;
  db: DB;

  constructor(args: {
    orgName: string;
    repoName: string;
    dir: string;
    db: DB;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.dir = args.dir;
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
      directory: createSortableDirectoryPath(args.path),
      orgName: this.orgName,
      repoName: this.repoName,
      branchName: args.branchName,
    });
  }

  static updateTree(args: { tree: TreeType; path: string; blobOid: string }) {
    const pathParts = args.path.split(sep);
    let currentEntry = args.tree;
    pathParts.forEach((part) => {
      let entry = currentEntry.entries[part];
      if (!entry) {
        entry = {
          type: "tree",
          mode: "040000",
          oid: "replace-me", // it probably makes sense to only populate the oid (and mode) when we're building the commit hash
          name: part,
          entries: {},
        };

        currentEntry.entries[part] = entry;
      }
      if (!entry)
        throw new Error(
          `Unable to find entry for path ${args.path}, no entry found at ${part}`
        );

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

  async getCommitForBranch(args: { branch: string }) {
    const commitOid = await git.resolveRef({
      fs,
      dir: this.dir,
      ref: args.branch,
    });

    if (typeof commitOid !== "string") {
      throw new Error(`Expected commit oid to be a string, got ${commitOid}`);
    }

    const commit = await git.readCommit({
      fs,
      dir: this.dir,
      oid: commitOid,
    });
    return commit;
  }
  async buildCommitTree(args: { branch: string }): Promise<TreeType> {
    const ref = args.branch;
    const lsTree = await this._lsTree({ ref });
    const commitInfo = await this.getCommitForBranch({
      branch: ref,
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
  buildCommitHash(args: { message: string; tree: TreeType }) {
    return GitExec.buildCommitHash({
      ...args,
      dir: this.dir,
    });
  }

  static buildCommitHash(args: {
    message: string;
    tree: TreeType;
    dir: string;
  }) {
    const tree = args.tree;
    const buildTree = (tree: TreeType) => {
      const entries: { type: "tree" | "blob"; oid: string; name: string }[] =
        [];
      for (const [name, entry] of Object.entries(tree.entries)) {
        if (entry.type === "tree") {
          const oid = buildTree(entry);
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
    const res = buildTree(tree);

    return res;
  }

  async clone(args: { branchName: string }) {
    const real = false;
    if (real) {
      const tmpDir = tmp.dirSync({ unsafeCleanup: true });
      console.log("cloning into...", tmpDir.name);

      // Example curl command for reference
      // curl -I \
      // -H "Accept: application/vnd.github+json" \
      // -H "Authorization: Bearer github_pat_123" \
      // -H "X-GitHub-Api-Version: 2022-11-28" \
      // https://raw.githubusercontent.com/jeffsee55/movie-content-private/main/assets/image-a.avif

      try {
        const token = "some-token";
        await git.clone({
          fs,
          dir: tmpDir.name,
          http: http,
          depth: 1,
          ref: args.branchName,
          // This isn't how the documentation reads but found this here
          // https://github.com/isomorphic-git/isomorphic-git/issues/1722#issuecomment-1783339875
          url: `https://${token}:@github.com/jeffsee55/movie-content-private`,
        });
      } catch (e) {
        console.log(e);
      }

      const dir = await fs.promises.readdir(tmpDir.name);
      this.dir = tmpDir.name;
      console.log("tempdir contents", dir);
    }
    // const pathToGitRepo = await fs.mkdtempSync(`${tmpDir.name}${sep}`);
    const commitInfo = await this.getCommitForBranch({
      branch: args.branchName,
    });

    const cloneResult = {
      branchName: args.branchName,
      commit: {
        parents: commitInfo.commit.parent,
        content: commitInfo.commit.message,
        oid: commitInfo.oid,
      },
    };
    return cloneResult;
  }

  async _lsTree({ ref }: { ref: string }) {
    return new Promise((resolve, reject) => {
      exec(
        `git ls-tree ${ref} -r -t`,
        { cwd: this.dir, maxBuffer: 1024 * 5000 },
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

  db: DB;
  gitExec: GitExec;

  constructor(args: {
    orgName: string;
    repoName: string;

    db: DB;
    gitExec: GitExec;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.gitExec = args.gitExec;
  }

  static async clone(args: {
    orgName: string;
    repoName: string;
    /**
     * The path to the Git repo on your machine, if no path
     * is provided, a clone will be performed and stored
     * into a temporary directory
     */
    dir: string;
    db: DB;
    branchName: string;
  }) {
    const gitExec = new GitExec({
      orgName: args.orgName,
      repoName: args.repoName,
      db: args.db,
      dir: args.dir,
    });
    const repo = new Repo({ ...args, gitExec });
    await repo.initialize();
    return await repo.checkout({ branchName: args.branchName });
  }

  static async init(args: {
    orgName: string;
    repoName: string;
    /**
     * The path to the Git repo on your machine, if no path
     * is provided, a clone will be performed and stored
     * into a temporary directory
     */
    dir: string;
    db: DB;
    branchName: string;
  }) {
    const gitExec = new GitExec({
      orgName: args.orgName,
      repoName: args.repoName,
      db: args.db,
      dir: args.dir,
    });
    return new Repo({ ...args, gitExec });
  }

  async checkout(args: { branchName: string }) {
    const gitExec = this.gitExec;
    const cloneResult = await gitExec.clone({ branchName: args.branchName });

    const firstCommit = await this.findOrCreateCommit(cloneResult);
    await this.findOrCreateBranch({
      branchName: args.branchName,
      commit: await firstCommit.oid,
    });
    return this;
  }

  async initialize() {
    await this.db
      .insert(tables.repos)
      .values({ orgName: this.orgName, repoName: this.repoName })
      .onConflictDoNothing();
  }
  async createBranch({
    branchName,
    commit: commitOid,
  }: {
    branchName: string;
    commit: string;
  }) {
    const branch = new Branch({
      db: this.db,
      repoName: this.repoName,
      orgName: this.orgName,
      branchName,
      commit: commitOid,
      gitExec: this.gitExec,
    });
    await branch.save();
    await branch.createBlobs();
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
        `Unable to find database record for branch ${args.branchName}, in repo ${this.orgName}:${this.repoName}`
      );
    }
    return Branch.fromRecord({
      ...branchRecord,
      db: this.db,
      branchName: args.branchName,
      repoName: this.repoName,
      orgName: this.orgName,
      gitExec: this.gitExec,
    });
  }

  async findOrCreateBranch(args: { branchName: string; commit: string }) {
    const orgName = this.orgName;
    const repoName = this.repoName;
    const existingBranch = await this.db.query.branches.findFirst({
      where(fields, ops) {
        return ops.and(
          ops.eq(fields.orgName, orgName),
          ops.eq(fields.repoName, repoName),
          ops.eq(fields.branchName, args.branchName),
          ops.eq(fields.commit, args.commit)
        );
      },
    });
    const branch = existingBranch
      ? Branch.fromRecord({
          ...existingBranch,
          gitExec: this.gitExec,
          db: this.db,
          orgName: this.orgName,
          repoName: this.repoName,
        })
      : await this.createBranch({
          branchName: args.branchName,
          commit: args.commit,
        });
    return branch;
  }

  async findOrCreateCommit(args: {
    branchName: string;
    commit: { parents: string[]; content: string; oid: string };
  }) {
    return await this.createCommit({
      branchName: args.branchName,
      commit: args.commit,
    });
  }

  async createCommit(args: {
    branchName: string;
    commit: { parents: string[]; content: string; oid: string };
  }) {
    const commit = new Commit({
      db: this.db,
      repoName: this.repoName,
      orgName: this.orgName,
      ...args.commit,
      message: args.commit.content,
      tree: await this.gitExec.buildCommitTree({
        branch: args.branchName,
      }),
      gitExec: this.gitExec,
    });
    const exists = false;
    if (!exists) {
      await commit.save();
    }
    return commit;
  }
}

export class Branch {
  orgName: string;
  repoName: string;
  db: DB;
  branchName: string;
  commitOid: string;

  gitExec: GitExec;

  constructor(args: {
    orgName: string;
    repoName: string;
    db: DB;
    branchName: string;
    commit: string;

    gitExec: GitExec;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.branchName = args.branchName;
    this.commitOid = args.commit;
    this.gitExec = args.gitExec;
  }

  static fromRecord(value: {
    branchName: string;
    orgName: string;
    db: DB;

    commit: string;
    repoName: string;
    gitExec: GitExec;
  }) {
    const branch = new Branch({
      branchName: value.branchName,
      orgName: value.orgName,
      db: value.db,
      commit: value.commit,
      repoName: value.repoName,
      gitExec: value.gitExec,
    });
    return branch;
  }

  async merge(branchToMerge: Branch) {
    console.log("merge", this.branchName, branchToMerge.branchName);
  }

  whereClause(
    ...args: Parameters<
      Exclude<
        NonNullable<
          NonNullable<
            Parameters<typeof this.db.query.blobsToBranches.findMany>[0]
          >["where"]
        >,
        SQL
      >
    >
  ) {
    const [fields, ops] = args;
    return ops.and(
      ops.eq(fields.orgName, this.orgName),
      ops.eq(fields.repoName, this.repoName),
      ops.eq(fields.branchName, this.branchName)
    );
  }

  async list(args?: { limit?: number; offset?: number }) {
    const items = await this.db.query.blobsToBranches.findMany({
      where: (fields, ops) => {
        return this.whereClause(fields, ops);
      },
      columns: {
        path: true,
      },
      with: {
        blob: true,
      },
      orderBy(fields, ops) {
        // FIXME: One limitation of this is that it doesn't follow
        // "natural" sorting so assets10.json will come before assets2.json
        return [ops.asc(fields.directory), ops.asc(fields.path)];
      },
      limit: args?.limit || 50,
      offset: args?.offset || 0,
    });
    return {
      orgName: this.orgName,
      repoName: this.repoName,
      branchName: this.branchName,
      commitOid: this.commitOid,
      items,
    };
  }

  async find(args: { path: string }) {
    const item = await this.db.query.blobsToBranches.findFirst({
      where: (fields, ops) => {
        return ops.and(
          this.whereClause(fields, ops),
          ops.eq(fields.path, args.path)
        );
      },
      columns: {
        path: true,
      },
      with: {
        blob: true,
      },
    });
    return {
      orgName: this.orgName,
      repoName: this.repoName,
      branchName: this.branchName,
      commitOid: this.commitOid,
      item,
    };
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
      tree: tree,
      gitExec: this.gitExec,
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
      .set({ commit: await commit.oid })
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
      tree: tree,
      gitExec: this.gitExec,
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
      directory: createSortableDirectoryPath(args.path),
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
      .set({ commit: await commit.oid })
      .where(
        and(
          eq(tables.branches.orgName, this.orgName),
          eq(tables.branches.repoName, this.repoName),
          eq(tables.branches.branchName, this.branchName)
        )
      );
    this.commitOid = await commit.oid;

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
      gitExec: this.gitExec,
      ...commitRecord,
    });
  }

  async createBlobs() {
    const currentCommit = await this.currentCommit();

    const gitExec = this.gitExec;

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
  db: DB;

  content: string;
  tree: TreeType;

  gitExec: GitExec;
  oid: string;
  parents?: string[];

  constructor(args: {
    orgName: string;
    repoName: string;
    db: DB;
    message: string;
    parents?: string[];

    tree: TreeType;
    gitExec: GitExec;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.content = args.message;
    this.tree = args.tree;
    this.gitExec = args.gitExec;
    const oid = args.gitExec.buildCommitHash({
      message: this.content,
      tree: this.tree,
    });
    this.parents = args.parents;
    this.oid = oid;
  }

  static fromRecord(value: {
    repoName: string;
    orgName: string;
    db: DB;
    content: string;
    oid: string;
    tree: string;

    gitExec: GitExec;
  }) {
    const tree = z.record(z.any()).parse(JSON.parse(value.tree)) as TreeType; // FIXME: Dont cast this
    return new Commit({
      repoName: value.repoName,
      orgName: value.orgName,
      db: value.db,
      message: value.content,
      tree: tree,
      gitExec: value.gitExec,
    });
  }

  async save() {
    // Only dealing with single parent commits for now
    // const parentOid = this.parents ? this.parents[0] : undefined;

    const extra: Record<"parent", string> | Record<string, never> = {};
    // if (parentOid) {
    //   const parent = await this.db.query.commits.findFirst({
    //     where: (fields, ops) => ops.eq(fields.oid, parentOid),
    //   });
    //   console.log(parentOid, parent);
    //   // if (parent) {
    //   //   extra["parent"] = parent.oid;
    //   // }
    // }

    await this.db.insert(tables.commits).values({
      content: this.content,
      oid: this.oid,
      tree: JSON.stringify(this.tree),
      ...extra,
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

const createSortableDirectoryPath = (path: string) => {
  return pathParse(path).dir.replace(/\//g, " ");
};

// Github rate limit

// curl \
//   -H "Accept: application/vnd.github+json" \
//   -H "Authorization: Bearer github_pat_123" \
//   https://api.github.com/rate_limit

// {
//   "resources": {
//     "core": {
//       "limit": 5000,
//       "remaining": 4999,
//       "reset": 1372700873,
//       "used": 1
//     },
//     "search": {
//       "limit": 30,
//       "remaining": 18,
//       "reset": 1372697452,
//       "used": 12
//     },
//     "graphql": {
//       "limit": 5000,
//       "remaining": 4993,
//       "reset": 1372700389,
//       "used": 7
//     },
//     "integration_manifest": {
//       "limit": 5000,
//       "remaining": 4999,
//       "reset": 1551806725,
//       "used": 1
//     },
//     "code_scanning_upload": {
//       "limit": 500,
//       "remaining": 499,
//       "reset": 1551806725,
//       "used": 1
//     }
//   },
//   "rate": {
//     "limit": 5000,
//     "remaining": 4999,
//     "reset": 1372700873,
//     "used": 1
//   }
// }
