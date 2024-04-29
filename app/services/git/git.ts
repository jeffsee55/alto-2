import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import { schema, tables } from "./schema";
import { and, eq, not } from "drizzle-orm";
// import * as git from "isomorphic-git";
// import fs from "fs";
import { exec } from "child_process";

type DB = BetterSQLite3Database<typeof schema>;

export class GitExec {
  cache: Record<string, unknown> = {};
  org: string;
  name: string;
  dir: string;
  db: BetterSQLite3Database<typeof schema>;

  constructor(args: {
    org: string;
    name: string;
    localPath: string;
    db: BetterSQLite3Database<typeof schema>;
  }) {
    this.org = args.org;
    this.name = args.name;
    this.db = args.db;
    this.dir = args.localPath;
  }

  static hashBlob(content: string) {
    return `blob-oid-${content}`;
  }

  static buildCommitHash(args: {
    message: string;
    blobMap: Record<string, string>;
  }) {
    return `commit-oid-${JSON.stringify(args.blobMap)}`;
  }

  async clone(args: { branchName: string }) {
    const lsTree = await this._lsTree({ ref: args.branchName, dir: this.dir });
    // console.log(lsTree);
    /**
     * When we're not working locally, we'll first need to clone into
     * a temp dir, and set that value to the localPath
     */
    const cloneResult = {
      commit: {
        content: "some commit content",
        oid: "some-commit-oid",
        blobMap: {
          "content/movie1.json": "blob-oid-1",
          "content/movie2.json": "blob-oid-2",
        },
      },
    };
    return cloneResult;
  }

  async _lsTree({ ref, dir }: { ref: string; dir: string }): Promise<string> {
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
    return `${oid}-content`;
    // Skipping unnecessary sha lookup
    // this is extremely fast when the objects are coming from a
    // pack file because the cache holds them in memory
    // const res = await git.readObject({
    //   fs,
    //   dir: this.dir,
    //   oid,
    //   cache: this.cache,
    // });
    // if (!res) {
    //   throw new Error(`Unable to read blob with oid ${oid}`);
    // }
    // return Buffer.from(res.object).toString("utf8");
  }
}

export class Repo {
  org: string;
  name: string;
  localPath: string;
  db: BetterSQLite3Database<typeof schema>;

  constructor(args: {
    org: string;
    name: string;
    localPath: string;
    db: BetterSQLite3Database<typeof schema>;
  }) {
    this.org = args.org;
    this.name = args.name;
    this.db = args.db;
    this.localPath = args.localPath;
  }

  static async clone(args: {
    org: string;
    name: string;
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
      commit: firstCommit.oid(),
    });
    await branch.createBlobs();
    return repo;
  }

  async initialize() {
    await this.db
      .insert(tables.repos)
      .values({ org: this.org, name: this.name });
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
      repoName: this.name,
      org: this.org,
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
          ops.eq(fields.name, args.branchName),
          ops.eq(fields.org, this.org),
          ops.eq(fields.repoName, this.name)
        ),
    });
    if (!branchRecord) {
      throw new Error(
        `Unable to find database record for branch branch ${args.branchName}, in repo ${this.org}:${this.name}`
      );
    }
    return Branch.fromRecord({
      ...branchRecord,
      db: this.db,
      name: args.branchName,
      repoName: this.name,
      org: this.org,
      localPath: this.localPath,
    });
  }

  async createCommit(args: {
    commit: { content: string; oid: string; blobMap: Record<string, string> };
  }) {
    const commit = new Commit({
      db: this.db,
      name: this.name,
      org: this.org,
      ...args.commit,
      message: args.commit.content,
    });
    await commit.save();
    return commit;
  }
}

export class Branch {
  org: string;
  repoName: string;
  db: BetterSQLite3Database<typeof schema>;
  branchName: string;
  commitOid: string;
  localPath: string;

  constructor(args: {
    org: string;
    repoName: string;
    db: BetterSQLite3Database<typeof schema>;
    branchName: string;
    commit: string;
    localPath: string;
  }) {
    this.org = args.org;
    this.repoName = args.repoName;
    this.db = args.db;
    this.branchName = args.branchName;
    this.commitOid = args.commit;
    this.localPath = args.localPath;
  }

  static fromRecord(value: {
    name: string;
    org: string;
    db: BetterSQLite3Database<typeof schema>;
    localPath: string;
    commit: string;
    repoName: string;
  }) {
    return new Branch({
      branchName: value.name,
      org: value.org,
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

    const blobMap = currentCommit.blobMap;

    delete blobMap[args.path];

    const commit = new Commit({
      org: this.org,
      name: this.repoName,
      db: this.db,
      blobMap,
      message: "some commit content 3",
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
      .set({ commit: commit.oid() })
      .where(
        and(
          eq(tables.branches.org, this.org),
          eq(tables.branches.repoName, this.repoName),
          eq(tables.branches.name, this.branchName)
        )
      );
  }

  async upsert(args: { path: string; content: string }) {
    // It's important that this instance isn't kept around,
    // since we're mutating the blobMap in-place for
    // performance reasons
    const currentCommit = await this.currentCommit();

    const blobOid = GitExec.hashBlob(args.content);

    const blobMap = currentCommit.blobMap;
    blobMap[args.path] = blobOid;

    const commit = new Commit({
      org: this.org,
      name: this.repoName,
      db: this.db,
      blobMap,
      message: "some commit content 2",
    });
    await commit.save();

    // await this.db.insert(tables.commits).values({
    //   content: "some commit content 2",
    //   oid: commitOid,
    //   blobMap: JSON.stringify(blobMap),
    // });
    if (typeof blobOid !== "string") {
      throw new Error(
        `Expected oid to be a string in tree map for path ${args.path}`
      );
    }
    await this.db.insert(tables.blobs).values({
      oid: blobOid,
      content: args.content,
    });

    await this.db.insert(tables.blobsToBranches).values({
      blobOid: blobOid,
      path: args.path,
      org: this.org,
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
      .set({ commit: commit.oid() })
      .where(
        and(
          eq(tables.branches.org, "jeffsee55"),
          eq(tables.branches.repoName, "movie-content"),
          eq(tables.branches.name, "main")
        )
      );
    this.commitOid = commit.oid();

    return { [args.path]: blobOid };
  }

  async save() {
    await this.db.insert(tables.branches).values({
      commit: this.commitOid,
      name: this.branchName,
      org: this.org,
      repoName: this.repoName,
    });
  }

  async getRecord() {
    const branchRecord = await this.db.query.branches.findFirst({
      where: (fields, ops) => ops.eq(fields.name, this.branchName),
    });
    if (!branchRecord) {
      throw new Error(
        `Unable to find database record for branch ${this.branchName}, in repo ${this.org}:${this.repoName}`
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
        `Unable to find database record for commit with oid ${branchRecord.commit} of branch ${this.branchName}, in repo ${this.org}:${this.repoName}`
      );
    }

    return Commit.fromRecord({
      name: this.repoName,
      org: this.org,
      db: this.db,
      ...commitRecord,
    });
  }

  async createBlobs() {
    const currentCommit = await this.currentCommit();
    for await (const [path, oid] of Object.entries(currentCommit.blobMap)) {
      if (typeof oid !== "string") {
        throw new Error(
          `Expected oid to be a string in tree map for path ${path}`
        );
      }
      const gitExec = new GitExec({
        db: this.db,
        name: this.repoName,
        org: this.org,
        localPath: this.localPath,
      });
      await this.db.insert(tables.blobs).values({
        oid,
        content: await gitExec.readBlob(oid),
      });

      await this.db.insert(tables.blobsToBranches).values({
        blobOid: oid,
        path: path,
        org: this.org,
        repoName: this.repoName,
        branchName: this.branchName,
      });
    }
  }
}

export class Commit {
  org: string;
  name: string;
  db: BetterSQLite3Database<typeof schema>;

  content: string;
  blobMap: Record<string, string>;

  constructor(args: {
    org: string;
    name: string;
    db: BetterSQLite3Database<typeof schema>;
    message: string;
    blobMap: Record<string, string>;
  }) {
    this.org = args.org;
    this.name = args.name;
    this.db = args.db;
    this.content = args.message;
    this.blobMap = args.blobMap;
  }

  static fromRecord(value: {
    name: string;
    org: string;
    db: DB;
    content: string;
    oid: string;
    blobMap: string;
  }) {
    const blobMap = z.record(z.string()).parse(JSON.parse(value.blobMap));
    return new Commit({
      name: value.name,
      org: value.org,
      db: value.db,
      message: value.content,
      // oid: GitExec.buildCommitHash({message: value.content, blobMap}),
      blobMap,
    });
  }

  oid() {
    const oid = GitExec.buildCommitHash({
      message: this.content,
      blobMap: this.blobMap,
    });
    return oid;
  }

  async save() {
    const oid = this.oid();
    await this.db.insert(tables.commits).values({
      content: this.content,
      oid,
      blobMap: JSON.stringify(this.blobMap),
    });
  }
}
