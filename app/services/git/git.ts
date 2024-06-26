import { z } from "zod";
import { tables } from "./schema";
import { SQL, and, eq, not, sql } from "drizzle-orm";
import diff3Merge from "diff3";
import { sep, parse as pathParse } from "path";
import { Buffer } from "buffer/";
import type { GitBase } from "./git.interface";

import type { TreeType, BlobType, DB } from "./types";

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
  remoteSource: string;
  db: DB;
  exec: GitBase;

  constructor(args: {
    orgName: string;
    repoName: string;
    remoteSource: string;
    db: DB;
    exec: GitBase;
  }) {
    this.remoteSource = args.remoteSource;
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.exec = args.exec;
  }

  async findBaseCommit(args: { ourCommitOid: string; theirCommitOid: string }) {
    const ourCommit = await this.db.query.commits.findFirst({
      where: (fields, ops) => ops.eq(fields.oid, args.ourCommitOid),
      columns: {
        oid: true,
      },
      with: {
        parent: {
          columns: {
            oid: true,
          },
          with: {
            parent: {
              columns: {
                oid: true,
              },
            },
          },
        },
      },
    });
    const theirCommit = await this.db.query.commits.findFirst({
      where: (fields, ops) => ops.eq(fields.oid, args.theirCommitOid),
      columns: {
        oid: true,
      },
      with: {
        parent: {
          columns: {
            oid: true,
          },
          with: {
            parent: {
              columns: {
                oid: true,
              },
            },
          },
        },
      },
    });

    if (!ourCommit || !theirCommit) {
      throw new Error(
        `Unable to find commits for ${args.ourCommitOid} and ${args.theirCommitOid}`
      );
    }
    const ancestorsFromThisBranch: string[] = [];
    type CommitRecord = {
      oid: string;
      parent?: CommitRecord | null | undefined;
    };
    const traverseParentFromCommit = (
      commitRecord: CommitRecord,
      accumulator: string[]
    ) => {
      if (commitRecord.parent) {
        accumulator.push(commitRecord.parent.oid);
        traverseParentFromCommit(commitRecord.parent, accumulator);
      }
    };
    traverseParentFromCommit(ourCommit, ancestorsFromThisBranch);
    const ancestorsFromThatBranch: string[] = [];
    traverseParentFromCommit(theirCommit, ancestorsFromThatBranch);

    let mergeBaseOid = "";
    for (const oid of [args.ourCommitOid, ...ancestorsFromThisBranch]) {
      if (ancestorsFromThatBranch.includes(oid)) {
        mergeBaseOid = oid;
        break;
      }
    }
    const mergeBase = await this.db.query.commits.findFirst({
      where: (fields, ops) => {
        return ops.eq(fields.oid, mergeBaseOid);
      },
      columns: {
        oid: true,
        content: true,
        tree: true,
      },
    });
    if (!mergeBase) {
      throw new Error(
        `Unable to find merge base for ${args.ourCommitOid} and ${args.theirCommitOid}`
      );
    }
    return Commit.fromRecord({
      db: this.db,
      orgName: this.orgName,
      repoName: this.repoName,
      gitExec: this,
      ...mergeBase,
    });
  }

  findDiffs<T extends boolean>({
    ourTree,
    theirTree,
    baseTree,
  }: {
    ourTree: TreeType;
    theirTree: TreeType;
    baseTree: TreeType;
    includeBlobs?: T;
  }): {
    added: { path: string; theirOid: string }[];
    modified: {
      path: string;
      ourOid?: string;
      baseOid: string;
      theirOid: string;
    }[];
    deleted: { path: string; baseOid: string; ourOid?: string }[];
  } {
    const added: {
      path: string;
      theirOid: string;
    }[] = [];
    const modified: {
      path: string;
      ourOid?: string;
      baseOid: string;
      theirOid: string;
    }[] = [];
    const deleted: { path: string; baseOid: string; ourOid?: string }[] = [];
    const walkTree = (
      item: TreeType,
      parentPath: string | null,
      type: "addedAndModified" | "deleted"
    ) => {
      for (const [name, entry] of Object.entries(item.entries)) {
        if (entry.type === "tree") {
          walkTree(
            entry,
            `${parentPath ?? ""}${parentPath ? sep : ""}${name}`,
            type
          );
        } else {
          const path = `${parentPath ?? ""}${parentPath ? sep : ""}${name}`;
          if (type === "addedAndModified") {
            const found = GitExec.readFromTree({ tree: baseTree, path });
            if (!found) {
              added.push({ path, theirOid: entry.oid });
            }
            if (found && found.oid !== entry.oid) {
              if (type === "addedAndModified") {
                const ourEntry = GitExec.readFromTree({ tree: ourTree, path });
                modified.push({
                  path,
                  theirOid: entry.oid,
                  baseOid: found.oid,
                  ourOid: ourEntry?.oid,
                });
              }
            }
          }
          if (type === "deleted") {
            const found = GitExec.readFromTree({ tree: theirTree, path });
            const ourEntry = GitExec.readFromTree({ tree: ourTree, path });
            if (!found) {
              deleted.push({ path, baseOid: entry.oid, ourOid: ourEntry?.oid });
            }
          }
        }
      }
    };
    walkTree(theirTree, null, "addedAndModified");
    walkTree(baseTree, null, "deleted");
    return { added, modified, deleted };
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
  static readFromTree(args: {
    tree: TreeType;
    path: string;
  }): TreeType | BlobType | undefined {
    const pathParts = args.path.split(sep);
    let result: TreeType | BlobType | undefined = undefined;
    let currentEntry = args.tree;
    pathParts.forEach((part) => {
      const entry = currentEntry.entries[part];
      if (!entry) {
        result = undefined;
      }
      if (entry?.type === "blob") {
        result = entry;
      } else {
        currentEntry = entry;
      }
    });
    return result;
  }

  // Probably not the best idea, no idea what kind of memory usage
  // deep copies will result in but might be worth looking into
  static updateTree(args: { tree: TreeType; path: string; blobOid: string }) {
    const tree = JSON.parse(JSON.stringify(args.tree));
    // const tree = args.tree;
    const pathParts = args.path.split(sep);
    let currentEntry = tree;
    pathParts.forEach((part, i) => {
      let entry = currentEntry.entries[part];
      if (!entry) {
        if (i === pathParts.length - 1) {
          entry = {
            type: "blob",
            mode: "100644",
            oid: args.blobOid,
            path: args.path,
            name: part,
          };
        } else {
          entry = {
            type: "tree",
            mode: "040000",
            oid: "replace-me", // it probably makes sense to only populate the oid (and mode) when we're building the commit hash
            path: args.path,
            name: part,
            entries: {},
          };
        }

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
          path: args.path,
          name: part,
        };
      } else {
        currentEntry = entry;
      }
    });
    return tree;
  }

  static removeFromTree(args: { tree: TreeType; path: string }) {
    const tree = JSON.parse(JSON.stringify(args.tree));
    const pathParts = args.path.split(sep);
    let currentEntry = tree;
    pathParts.forEach((part) => {
      const entry = currentEntry.entries[part];
      if (!entry) throw new Error(`Unable to find entry for path ${args.path}`);

      if (entry.type === "blob") {
        delete currentEntry.entries[part];
      } else {
        currentEntry = entry;
      }
    });
    return tree;
  }

  buildCommitHash(args: { message: string; treeOid: string }) {
    const string = `tree ${args.treeOid}\n\n${args.message}`;
    const buffer = Buffer.from(string, "utf8");
    const wrapped = Buffer.concat([
      Buffer.from("commit "),
      Buffer.from(buffer.length.toString()),
      Buffer.from([0]),
      buffer,
    ]);
    return this.exec.hash(wrapped);
  }

  async buildTreeHash(args: { tree: TreeType }) {
    const tree = args.tree;
    const buildTree = async (tree: TreeType) => {
      const entries: { type: "tree" | "blob"; oid: string; name: string }[] =
        [];
      for (const [name, entry] of Object.entries(tree.entries)) {
        if (entry.type === "tree") {
          const oid = await buildTree(entry);
          entries.push({ type: "tree", oid: oid, name });
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
      // I think likely the buffer above is different between
      // the 2 thanks to Buffer being different (?)
      return this.exec.hash(wrapped);
    };
    const res = await buildTree(tree);

    return res;
  }

  async clone(args: { branchName: string }) {
    return this.exec.clone({
      remoteSource: this.remoteSource,
      branchName: args.branchName,
    });
  }

  async readBlob(oid: string) {
    return this.exec.readBlob(this.remoteSource, oid);
  }
}

export class Repo {
  orgName: string;
  repoName: string;
  remoteSource: string;

  db: DB;
  gitExec: GitExec;

  constructor(args: {
    orgName: string;
    repoName: string;
    remoteSource: string;

    db: DB;
    gitExec: GitExec;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.remoteSource = args.remoteSource;
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
    exec: GitBase;
    branchName: string;
  }) {
    const remoteSource = args.dir
      ? args.dir
      : `https://github.com/${args.orgName}/${args.repoName}.git`;
    const gitExec = new GitExec({
      orgName: args.orgName,
      repoName: args.repoName,
      remoteSource,
      db: args.db,
      exec: args.exec,
    });
    const repo = new Repo({ ...args, gitExec, remoteSource });
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
    exec: GitBase;
    branchName: string;
  }) {
    const remoteSource = args.dir
      ? args.dir
      : `https://github.com/${args.orgName}/${args.repoName}.git`;
    const gitExec = new GitExec({
      orgName: args.orgName,
      repoName: args.repoName,
      db: args.db,
      remoteSource,
      exec: args.exec,
    });
    return new Repo({ ...args, gitExec, remoteSource });
  }

  async checkout(args: { branchName: string }) {
    const gitExec = this.gitExec;
    const cloneResult = await gitExec.clone({ branchName: args.branchName });

    const firstCommit = await this.createCommit(cloneResult);
    await this.findOrCreateBranch({
      branchName: args.branchName,
      commitOid: await firstCommit.oid,
    });
    await this.findOrCreateBranch({
      branchName: `origin/${args.branchName}`,
      commitOid: await firstCommit.oid,
    });
    return this;
  }

  async initialize() {
    await this.db
      .insert(tables.repos)
      .values({
        orgName: this.orgName,
        repoName: this.repoName,
        remoteUrl: this.remoteSource,
      })
      .onConflictDoNothing();
  }
  async createBranch({
    branchName,
    commitOid: commitOid,
  }: {
    branchName: string;
    commitOid: string;
  }) {
    const branch = new Branch({
      db: this.db,
      repoName: this.repoName,
      orgName: this.orgName,
      branchName,
      commitOid: commitOid,
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

  async findOrCreateBranch(args: { branchName: string; commitOid: string }) {
    const orgName = this.orgName;
    const repoName = this.repoName;
    const existingBranch = await this.db.query.branches.findFirst({
      where(fields, ops) {
        return ops.and(
          ops.eq(fields.orgName, orgName),
          ops.eq(fields.repoName, repoName),
          ops.eq(fields.branchName, args.branchName),
          ops.eq(fields.commitOid, args.commitOid)
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
          commitOid: args.commitOid,
        });
    return branch;
  }

  async createCommit(args: {
    branchName: string;
    tree: TreeType;
    commit: { parents: string[]; content: string; oid: string };
  }) {
    const commit = await Commit.build({
      db: this.db,
      repoName: this.repoName,
      orgName: this.orgName,
      ...args.commit,
      message: args.commit.content,
      tree: args.tree,
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
  error?: GitError;

  constructor(args: {
    orgName: string;
    repoName: string;
    db: DB;
    branchName: string;
    commitOid: string;

    gitExec: GitExec;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.branchName = args.branchName;
    this.commitOid = args.commitOid;
    this.gitExec = args.gitExec;
  }

  static fromRecord(value: {
    branchName: string;
    orgName: string;
    db: DB;

    commitOid: string;
    repoName: string;
    gitExec: GitExec;
  }) {
    const branch = new Branch({
      branchName: value.branchName,
      orgName: value.orgName,
      db: value.db,
      commitOid: value.commitOid,
      repoName: value.repoName,
      gitExec: value.gitExec,
    });
    return branch;
  }

  async checkoutNewBranch(args: { newBranchName: string }) {
    const newBranch = new Branch({
      branchName: args.newBranchName,
      orgName: this.orgName,
      db: this.db,
      commitOid: this.commitOid,
      repoName: this.repoName,
      gitExec: this.gitExec,
    });
    await newBranch.save();
    const table = tables.blobsToBranches;
    // https://discord.com/channels/1043890932593987624/1127483269043196064/1187437162543726602
    const statement = sql`INSERT INTO ${table} (${sql.raw(
      table.orgName.name
    )}, ${sql.raw(table.repoName.name)}, ${sql.raw(table.path.name)}, ${sql.raw(
      table.directory.name
    )}, ${sql.raw(table.blobOid.name)}, ${sql.raw(table.branchName.name)})
SELECT ${table.orgName}, ${table.repoName}, ${table.path}, ${
      table.directory
    }, ${table.blobOid}, ${newBranch.branchName}
FROM ${table}
WHERE ${table.branchName} = ${this.branchName};`;
    await this.db.run(statement);
    return newBranch;
  }
  async pull(changes: z.infer<typeof changesSchema>["changes"]) {
    return this.syncChanges({
      direction: "ahead",
      changes: changes,
    });
  }

  async syncChanges(args: {
    direction: "ahead" | "behind";
    changes: z.infer<typeof changesSchema>["changes"];
  }) {
    if (args.direction === "behind") {
      throw new GitError("NO_SYNC");
    }
    for await (const change of args.changes) {
      try {
        for await (const modified of change.modified) {
          await this.upsert({
            path: modified.path,
            content: change.blobs[modified.theirOid],
          });
        }
        for await (const added of change.added) {
          await this.upsert({
            path: added.path,
            content: change.blobs[added.theirOid],
          });
        }
        for await (const deleted of change.deleted) {
          await this.delete({
            path: deleted.path,
          });
        }
      } catch (e) {
        // Don't worry about mutations retrying (for now)
      }
    }
  }

  async walkCommits(
    callback: (args: { oid: string }) => Promise<{
      commitOid: string;
      changes: Awaited<ReturnType<Branch["changesSince"]>>;
    }>
  ): Promise<void> {
    const currentCommit = await this.currentCommit();

    const result = await callback({ oid: currentCommit.oid });

    if (!result) {
      // we don't have this in our lineage, move
      await currentCommit.walkParents(async (commit) => {
        const result = await callback({ oid: commit.oid });
        // console.log("serach parents", this.commitOid, result?.commitOid);
        if (result?.changes.length > 0) {
          // we need to move back to that commit and catch
          // up the history
          const commit = await Commit.fromQuery({
            db: this.db,
            oid: result.commitOid,
            orgName: this.orgName,
            repoName: this.repoName,
            gitExec: this.gitExec,
          });
          const latestCommit = await commit.createCommitLineage(result.changes);
          const currentCommit = await this.currentCommit();
          await currentCommit.createMergeCommit(commit, latestCommit, this);
          return true;
        }
        return false;
      });
    }

    if (result?.changes.length > 0) {
      await this.pull(result.changes);
    }
  }

  async findMergeBase(args: { branch: Branch }): Promise<Commit> {
    const currentCommit = await this.currentCommit();
    let commmonCommit: Commit | null = null;
    await currentCommit.walkParents(async (commit) => {
      const otherBranchCommit = await args.branch.currentCommit();
      await otherBranchCommit.walkParents(async (otherCommit) => {
        if (otherCommit.oid === commit.oid) {
          commmonCommit = commit;
          return true;
        }
        return false;
      });
      return false;
    });
    if (!commmonCommit) {
      throw new Error("Unable to find merge base");
    }
    return commmonCommit;
  }

  /**
   * This could be an expensive operation, if the remote is ahead of
   * the client it will walk commits. Walking the parents of each
   * commit one-by-one should ideally grab the commit with several
   * parents included in the db request (like 10?) so walking is less costly
   */
  async changesSince2(
    commitOid: string,
    callback: (commit: Commit) => ReturnType<Branch["changesSince"]>
  ): Promise<{
    direction: "ahead" | "behind";
    changes: Awaited<ReturnType<Branch["changesSince"]>>;
    ahead: Awaited<ReturnType<Branch["changesSince"]>>;
    behind: Awaited<ReturnType<Branch["changesSince"]>>;
  }> {
    const changesSince = await this.changesSince(commitOid);
    if (changesSince.length > 0) {
      return {
        direction: "ahead",
        changes: await this.changesSince(commitOid),
        ahead: await this.changesSince(commitOid),
        behind: [],
      };
    } else {
      const changesResult: {
        direction: "ahead" | "behind";
        changes: Awaited<ReturnType<Branch["changesSince"]>>;
        ahead: Awaited<ReturnType<Branch["changesSince"]>>;
        behind: Awaited<ReturnType<Branch["changesSince"]>>;
      } = {
        direction: "behind",
        changes: [],
        ahead: [],
        behind: [],
      };
      const currentCommit = await this.currentCommit();
      await currentCommit.walkParents(async (commit) => {
        const changes2 = await callback(commit);
        if (changes2.length > 0) {
          changesResult.changes = changes2;
          changesResult.behind = changes2;
          return true;
        }
        return false;
      });
      return changesResult;
    }
  }

  async changesSince(
    commitOid: string
  ): Promise<z.infer<typeof changesSchema>["changes"]> {
    let currentCommit = await this.currentCommit();
    let foundParent = false;
    // const commitsToSync = [currentCommit];
    const diffs: (ReturnType<GitExec["findDiffs"]> & {
      commit: {
        message: string;
        oid: string;
        tree: TreeType;
        parents?: string[];
      };
      blobs: Record<string, string>;
    })[] = [];

    await currentCommit.walkParents(async (parentCommit) => {
      const diffs2 = parentCommit.gitExec.findDiffs({
        baseTree: parentCommit.tree,
        ourTree: parentCommit.tree,
        theirTree: currentCommit.tree,
      });
      const blobs: Record<string, string> = {};
      for await (const diff of diffs2.added) {
        const value = (await this.find({ path: diff.path }))?.item.blob.content;
        if (!value) {
          throw new Error(
            `Unable to find blob for path ${diff.path} in branch ${this.branchName} of repo ${this.repoName} in org ${this.orgName}`
          );
        }
        blobs[diff.theirOid] = value;
      }
      for await (const diff of diffs2.modified) {
        const value = (await this.find({ path: diff.path }))?.item.blob.content;
        if (!value) {
          throw new Error(
            `Unable to find blob for path ${diff.path} in branch ${this.branchName} of repo ${this.repoName} in org ${this.orgName}`
          );
        }
        // console.log("add", value);
        // await branch.gitExec.exec.hashBlob(value);
        blobs[diff.theirOid] = value;
      }
      // commitsToSync.push(parentCommit);
      diffs.push({
        ...diffs2,
        commit: {
          message: currentCommit.content,
          oid: currentCommit.oid,
          tree: currentCommit.tree,
          parents: currentCommit.parents,
        },
        blobs,
      });
      if (parentCommit.oid === commitOid) {
        foundParent = true;
        // commitsToSync.push(parentCommit);
        return true;
      }
      currentCommit = parentCommit;
      return false;
    });
    if (!foundParent) {
      return [];
    }
    return diffs.reverse();
  }

  async findBaseCommit(commitOid: string) {
    const baseCommit = await this.gitExec.findBaseCommit({
      ourCommitOid: this.commitOid,
      theirCommitOid: commitOid,
    });
    return baseCommit;
  }

  async diff(branchToMerge: Branch) {
    const baseCommit = await this.findBaseCommit(branchToMerge.commitOid);

    const ourCommit = await this.currentCommit();
    const theirCommit = await branchToMerge.currentCommit();

    const diff = this.gitExec.findDiffs({
      ourTree: ourCommit.tree,
      theirTree: theirCommit.tree,
      baseTree: baseCommit.tree,
    });
    return {
      baseOid: baseCommit.oid,
      ...diff,
    };
  }

  async merge(branchToMerge: Branch) {
    const diff = await this.diff(branchToMerge);
    const currentCommit = await this.currentCommit();

    for await (const { path, theirOid } of diff.added) {
      await this.db.insert(tables.blobsToBranches).values({
        blobOid: theirOid,
        path,
        directory: createSortableDirectoryPath(path),
        orgName: this.orgName,
        repoName: this.repoName,
        branchName: this.branchName,
      });
    }
    for await (const { path, ourOid, baseOid, theirOid } of diff.modified) {
      const baseCommit = await this.db.query.commits.findFirst({
        where: (fields, ops) => ops.and(ops.eq(fields.oid, diff.baseOid)),
      });
      if (baseCommit) {
        const baseBlob = await this.db.query.blobs.findFirst({
          where(fields, ops) {
            return ops.and(ops.eq(fields.oid, baseOid));
          },
        });
        if (ourOid) {
          const ourBlob = await this.db.query.blobs.findFirst({
            where(fields, ops) {
              return ops.and(ops.eq(fields.oid, ourOid));
            },
          });

          const theirBlob = await this.db.query.blobs.findFirst({
            where(fields, ops) {
              return ops.and(ops.eq(fields.oid, theirOid));
            },
          });
          if (!ourBlob || !theirBlob || !baseBlob) {
            throw new Error(
              `Unable to find blobs for ${ourOid} and ${theirOid}`
            );
          }
          baseBlob;
          const ourContent = Buffer.from(ourBlob.content).toString("utf8");
          const baseContent = Buffer.from(baseBlob.content).toString("utf8");
          const theirContent = Buffer.from(theirBlob.content).toString("utf8");
          const { mergedText, cleanMerge } = await mergeFile({
            branches: [
              "should not matter",
              this.branchName,
              branchToMerge.branchName,
            ],
            contents: [baseContent, ourContent, theirContent],
          });
          if (!cleanMerge) {
            throw new Error(`Unable to merge \n${mergedText}`);
          } else {
            const oid = await this.gitExec.exec.hashBlob(mergedText);
            await this.db
              .insert(tables.blobs)
              .values({
                oid: oid,
                content: mergedText,
              })
              .onConflictDoNothing();
            await this.db
              .update(tables.blobsToBranches)
              .set({
                blobOid: oid,
              })
              .where(
                and(
                  eq(tables.blobsToBranches.orgName, this.orgName),
                  eq(tables.blobsToBranches.repoName, this.repoName),
                  eq(tables.blobsToBranches.branchName, this.branchName),
                  eq(tables.blobsToBranches.path, path),
                  eq(tables.blobsToBranches.blobOid, ourOid)
                )
              );
          }
        }
      }
    }
    for await (const { path, baseOid, ourOid } of diff.deleted) {
      await this.db.delete(tables.blobsToBranches).where(
        and(
          eq(tables.blobsToBranches.orgName, this.orgName),
          eq(tables.blobsToBranches.repoName, this.repoName),
          eq(tables.blobsToBranches.branchName, this.branchName),
          eq(tables.blobsToBranches.path, path),
          // FIXME: This should be ourOid
          eq(tables.blobsToBranches.blobOid, baseOid)
        )
      );
      if (ourOid) {
        await this.db.delete(tables.blobsToBranches).where(
          and(
            eq(tables.blobsToBranches.orgName, this.orgName),
            eq(tables.blobsToBranches.repoName, this.repoName),
            eq(tables.blobsToBranches.branchName, this.branchName),
            eq(tables.blobsToBranches.path, path),
            // FIXME: This should be ourOid
            eq(tables.blobsToBranches.blobOid, ourOid)
          )
        );
      }
    }

    const isFastForward = diff.baseOid === this.commitOid;
    let tree = currentCommit.tree;
    if (isFastForward) {
      this.commitOid = branchToMerge.commitOid;
    } else {
      for await (const { path, theirOid } of diff.added) {
        tree = GitExec.updateTree({
          tree,
          path,
          blobOid: theirOid,
        });
      }
      for await (const { path, theirOid } of diff.modified) {
        tree = GitExec.updateTree({
          tree,
          path,
          blobOid: theirOid,
        });
      }
      for await (const { path } of diff.deleted) {
        tree = GitExec.removeFromTree({ tree, path });
      }

      const commit = await Commit.build({
        db: this.db,
        gitExec: this.gitExec,
        message: `Merged ${this.commitOid} and ${branchToMerge.commitOid}`,
        parents: [this.commitOid, branchToMerge.commitOid],
        orgName: this.orgName,
        repoName: this.repoName,
        tree: currentCommit.tree,
      });
      await commit.save();
      this.commitOid = commit.oid;
    }
    this.save();
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
    if (!item) {
      return null;
    }
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

    let tree = currentCommit.tree;
    tree = GitExec.removeFromTree({ tree, path: args.path });

    const commit = await Commit.build({
      orgName: this.orgName,
      repoName: this.repoName,
      db: this.db,
      message: `Deleted ${args.path}`,
      tree: tree,
      gitExec: this.gitExec,
      parents: [currentCommit.oid],
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
      .set({ commitOid: await commit.oid })
      .where(
        and(
          eq(tables.branches.orgName, this.orgName),
          eq(tables.branches.repoName, this.repoName),
          eq(tables.branches.branchName, this.branchName)
        )
      );
    this.commitOid = commit.oid;
    await this.save();
  }

  async upsert(args: { path: string; content: string }) {
    // It's important that this instance isn't kept around,
    // since we're mutating the tree in-place for
    // performance reasons
    const currentCommit = await this.currentCommit();

    const blobOid = await this.gitExec.exec.hashBlob(args.content);

    let tree = currentCommit.tree;
    tree = GitExec.updateTree({ blobOid, tree, path: args.path });

    const commit = await Commit.build({
      orgName: this.orgName,
      repoName: this.repoName,
      db: this.db,
      message: `Autosave of ${args.path}`,
      tree: tree,
      gitExec: this.gitExec,
      parents: [currentCommit.oid],
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
      .set({ commitOid: await commit.oid })
      .where(
        and(
          eq(tables.branches.orgName, this.orgName),
          eq(tables.branches.repoName, this.repoName),
          eq(tables.branches.branchName, this.branchName)
        )
      );
    this.commitOid = commit.oid;
    await this.save();

    return { [args.path]: blobOid };
  }

  async save() {
    await this.db
      .insert(tables.branches)
      .values({
        commitOid: this.commitOid,
        branchName: this.branchName,
        orgName: this.orgName,
        repoName: this.repoName,
      })
      .onConflictDoUpdate({
        target: [
          tables.branches.branchName,
          tables.branches.orgName,
          tables.branches.repoName,
        ],
        set: {
          commitOid: this.commitOid,
        },
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
      where: (fields, ops) => ops.eq(fields.oid, branchRecord.commitOid),
    });
    if (!commitRecord) {
      throw new Error(
        `Unable to find database record for commit with oid ${branchRecord.commitOid} of branch ${this.branchName}, in repo ${this.orgName}:${this.repoName}`
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
    oid: string;

    tree: TreeType;
    gitExec: GitExec;
  }) {
    this.orgName = args.orgName;
    this.repoName = args.repoName;
    this.db = args.db;
    this.content = args.message;
    this.tree = args.tree;
    this.gitExec = args.gitExec;
    console.log("parents", args.parents);
    this.parents = args.parents;
    this.oid = args.oid;
  }

  static async fromQuery(args: {
    repoName: string;
    orgName: string;
    db: DB;
    gitExec: GitExec;
    oid: string;
  }) {
    const record = await args.db.query.commits.findFirst({
      where: (fields, ops) => ops.and(ops.eq(fields.oid, args.oid)),
    });
    if (!record) {
      throw new Error(`Unable to find commit with oid ${args.oid}`);
    }

    return Commit.fromRecord({
      ...args,
      ...record,
    });
  }

  static async fromRecord(value: {
    repoName: string;
    orgName: string;
    db: DB;
    content: string;
    oid: string;
    tree: string;
    parent?: string | null;

    gitExec: GitExec;
  }) {
    const tree = z.record(z.any()).parse(JSON.parse(value.tree)) as TreeType; // FIXME: Dont cast this
    return new Commit({
      repoName: value.repoName,
      orgName: value.orgName,
      db: value.db,
      message: value.content,
      tree: tree,
      oid: value.oid,
      parents: value.parent ? [value.parent] : undefined,
      gitExec: value.gitExec,
    });
  }
  static async build(args: {
    repoName: string;
    orgName: string;
    db: DB;
    parents?: string[];
    message: string;
    tree: TreeType;
    gitExec: GitExec;
  }) {
    const treeOid = await args.gitExec.buildTreeHash({
      tree: args.tree,
    });
    const oid = await args.gitExec.buildCommitHash({
      message: args.message,
      treeOid: treeOid,
    });
    return new Commit({
      ...args,
      oid,
    });
  }

  async walkParents(callback: (commit: Commit) => Promise<boolean> | boolean) {
    const parents = this.parents;
    if (!parents) {
      return;
    }
    const parentOid = parents[0];
    const parent = await this.db.query.commits.findFirst({
      where: (fields, ops) => ops.eq(fields.oid, parentOid),
    });
    if (parent) {
      const parentCommit = await Commit.fromRecord({
        repoName: this.repoName,
        orgName: this.orgName,
        db: this.db,
        content: parent.content,
        oid: parent.oid,
        tree: parent.tree,
        parent: parent.parent,
        gitExec: this.gitExec,
      });
      const callbackResult = await callback(parentCommit);
      if (!callbackResult) {
        await parentCommit.walkParents(callback);
      }
    } else {
      throw new Error(`No parent found for commit ${this.oid}`);
    }
  }

  async createMergeCommit(
    mergeBaseCommit: Commit,
    theirCommit: Commit,
    branchToLink?: Branch
  ) {
    const change = this.gitExec.findDiffs({
      ourTree: this.tree,
      theirTree: theirCommit.tree,
      baseTree: mergeBaseCommit.tree,
    });
    let tree = this.tree;
    let message = `Merge of ${this.oid.slice(0, 7)} and ${theirCommit.oid.slice(
      0,
      7
    )}`;

    for await (const modified of change.modified) {
      message += `${message ? "\n" : ""}Autosave of ${modified.path}`;
      tree = GitExec.updateTree({
        blobOid: modified.theirOid,
        tree,
        path: modified.path,
      });
      if (branchToLink) {
        await this.db
          .update(tables.blobsToBranches)
          .set({
            blobOid: modified.theirOid,
          })
          .where(
            and(
              eq(tables.blobsToBranches.orgName, this.orgName),
              eq(tables.blobsToBranches.repoName, this.repoName),
              eq(tables.blobsToBranches.branchName, branchToLink.branchName),
              eq(tables.blobsToBranches.path, modified.path)
            )
          );
      }
    }
    for await (const added of change.added) {
      message += `${message ? "\n" : ""}Autosave of ${added.path}`;
      tree = GitExec.updateTree({
        blobOid: added.theirOid,
        tree,
        path: added.path,
      });

      if (branchToLink) {
        await this.db.insert(tables.blobsToBranches).values({
          orgName: this.orgName,
          repoName: this.repoName,
          branchName: branchToLink.branchName,
          directory: createSortableDirectoryPath(added.path),
          path: added.path,
          blobOid: added.theirOid,
        });
      }
    }
    for await (const deleted of change.deleted) {
      message += `${message ? "\n" : ""}Deleted ${deleted.path}`;
      tree = GitExec.removeFromTree({ tree, path: deleted.path });
      if (branchToLink) {
        await this.db
          .delete(tables.blobsToBranches)
          .where(
            and(
              eq(tables.blobsToBranches.orgName, this.orgName),
              eq(tables.blobsToBranches.repoName, this.repoName),
              eq(tables.blobsToBranches.branchName, branchToLink.branchName),
              eq(tables.blobsToBranches.path, deleted.path)
            )
          );
      }
    }
    const commit = await Commit.build({
      orgName: this.orgName,
      repoName: this.repoName,
      db: this.db,
      message,
      tree,
      gitExec: this.gitExec,
      parents: [this.oid, theirCommit.oid],
    });
    await commit.save();
    if (branchToLink) {
      branchToLink.commitOid = commit.oid;
      await branchToLink.save();
    }
    return commit;
  }

  async createCommitLineage(
    changes: Awaited<ReturnType<Branch["changesSince"]>>
  ): Promise<Commit> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let latestCommit: Commit = this;
    for await (const change of changes) {
      let message = ``;
      let tree = latestCommit.tree;
      try {
        // TODO: I think I still need to create the blobs!
        for await (const modified of change.modified) {
          message += `${message ? "\n" : ""}Autosave of ${modified.path}`;
          tree = GitExec.updateTree({
            blobOid: modified.theirOid,
            tree,
            path: modified.path,
          });
          await this.db.insert(tables.blobs).values({
            oid: modified.theirOid,
            content: change.blobs[modified.theirOid],
          });
        }
        for await (const added of change.added) {
          message += `${message ? "\n" : ""}Autosave of ${added.path}`;
          tree = GitExec.updateTree({
            blobOid: added.theirOid,
            tree,
            path: added.path,
          });
          await this.db.insert(tables.blobs).values({
            oid: added.theirOid,
            content: change.blobs[added.theirOid],
          });
        }
        for await (const deleted of change.deleted) {
          message += `${message ? "\n" : ""}Deleted ${deleted.path}`;
          tree = GitExec.removeFromTree({ tree, path: deleted.path });
        }
      } catch (e) {
        // Don't worry about mutations retrying (for now)
      }
      const commit = await Commit.build({
        orgName: this.orgName,
        repoName: this.repoName,
        db: this.db,
        message,
        tree,
        gitExec: this.gitExec,
        parents: [latestCommit.oid],
      });
      if (commit.oid !== change.commit.oid) {
        throw new Error(`Invalid commit lineage!`);
      }
      await commit.save({ ignoreError: true });
      latestCommit = commit;
    }
    return latestCommit;
  }

  getEntryForPath(path: string) {
    return GitExec.readFromTree({ tree: this.tree, path });
  }

  async save(options?: { ignoreError?: boolean }) {
    // Only dealing with single parent commits for now
    const parentOid = this.parents ? this.parents[0] : undefined;
    const secondParentOid = this.parents ? this.parents[1] : undefined;

    const extra:
      | Record<"parent" | "secondParent", string>
      | Record<string, unknown> = {};
    if (parentOid) {
      const parent = await this.db.query.commits.findFirst({
        where: (fields, ops) => ops.eq(fields.oid, parentOid),
        columns: { oid: true },
      });
      if (parent) {
        extra["parent"] = parent.oid;
      }
    }
    if (secondParentOid) {
      const secondParent = await this.db.query.commits.findFirst({
        where: (fields, ops) => ops.eq(fields.oid, secondParentOid),
        columns: { oid: true },
      });
      if (secondParent) {
        extra["secondParent"] = secondParent.oid;
      }
    }

    const args = {
      content: this.content,
      oid: this.oid,
      tree: JSON.stringify(this.tree),
      ...extra,
    };
    if (options?.ignoreError) {
      await this.db.insert(tables.commits).values(args).onConflictDoNothing();
    } else {
      await this.db.insert(tables.commits).values(args);
    }
  }
}

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

const LINEBREAKS = /^.*(\r?\n|$)/gm;

export function mergeFile({
  branches,
  contents,
}: {
  branches: string[];
  contents: string[];
}) {
  const ourName = branches[1];
  const theirName = branches[2];

  const baseContent = contents[0];
  const ourContent = contents[1];
  const theirContent = contents[2];

  const ours = ourContent.match(LINEBREAKS);
  const base = baseContent.match(LINEBREAKS);
  const theirs = theirContent.match(LINEBREAKS);

  if (!ours || !base || !theirs) {
    throw new Error("Unable to determine content of files for merge");
  }
  // Here we let the diff3 library do the heavy lifting.
  const result = diff3Merge(ours, base, theirs);

  const markerSize = 7;

  // Here we note whether there are conflicts and format the results
  let mergedText = "";
  let cleanMerge = true;

  for (const item of result) {
    if (item.ok) {
      mergedText += item.ok.join("");
    }
    if (item.conflict) {
      cleanMerge = false;
      mergedText += `${"<".repeat(markerSize)} ${ourName}\n`;
      mergedText += item.conflict.a.join("");

      mergedText += `${"=".repeat(markerSize)}\n`;
      mergedText += item.conflict.b.join("");
      mergedText += `${">".repeat(markerSize)} ${theirName}\n`;
    }
  }
  return { cleanMerge, mergedText };
}

export const changesSchema = z.object({
  orgName: z.string(),
  repoName: z.string(),
  branchName: z.string(),
  changes: z.array(
    z.object({
      added: z.array(
        z.object({
          path: z.string(),
          theirOid: z.string(),
        })
      ),
      deleted: z.array(
        z.object({
          path: z.string(),
          baseOid: z.string(),
          ourOid: z.string().nullish(),
        })
      ),
      modified: z.array(
        z.object({
          path: z.string(),
          ourOid: z.string().nullish(),
          baseOid: z.string(),
          theirOid: z.string(),
        })
      ),
      commit: z.object({
        message: z.string(),
        oid: z.string(),
        tree: z.record(z.any()),
        parents: z.array(z.string()).nullish(),
      }),
      blobs: z.record(z.string()),
    })
  ),
});

const errorCodes = {
  NO_SYNC: {
    description: "Unable to sync because the remote is ahead",
  },
};

export class GitError extends Error {
  code: keyof typeof errorCodes;
  constructor(code: keyof typeof errorCodes) {
    super();
    this.code = code;
  }
}
