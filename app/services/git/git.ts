import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema, tables } from "./schema";

export class Git {}

export class Repo {
  org: string;
  name: string;
  db: BetterSQLite3Database<typeof schema>;

  constructor(args: {
    org: string;
    name: string;
    db: BetterSQLite3Database<typeof schema>;
  }) {
    this.org = args.org;
    this.name = args.name;
    this.db = args.db;
  }

  async initialize() {
    await this.db
      .insert(tables.repos)
      .values({ org: "jeffsee55", name: "movie-content" });
  }
  async createBranch({
    branchName,
    commitOid,
  }: {
    branchName: string;
    commitOid: string;
  }) {
    const branch = new Branch({
      db: this.db,
      repoName: this.name,
      org: this.org,
      branchName,
      commitOid,
    });
    await branch.save();
    return branch;
  }

  async createCommit() {
    const commit = new Commit({
      db: this.db,
      name: this.name,
      org: this.org,
      content: "some commit content",
      oid: "some-commit-oid",
      blobMap: {
        "content/movie1.json": "blob-oid-1",
        "content/movie2.json": "blob-oid-2",
      },
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

  constructor(args: {
    org: string;
    repoName: string;
    db: BetterSQLite3Database<typeof schema>;
    branchName: string;
    commitOid: string;
  }) {
    this.org = args.org;
    this.repoName = args.repoName;
    this.db = args.db;
    this.branchName = args.branchName;
    this.commitOid = args.commitOid;
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
      await this.db.insert(tables.blobs).values({
        oid,
        // mocking content
        content: `${oid}-content`,
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
  oid: string;
  blobMap: Record<string, string>;

  constructor(args: {
    org: string;
    name: string;
    db: BetterSQLite3Database<typeof schema>;
    content: string;
    oid: string;
    blobMap: Record<string, string>;
  }) {
    this.org = args.org;
    this.name = args.name;
    this.db = args.db;
    this.content = args.content;
    this.oid = args.oid;
    this.blobMap = args.blobMap;
  }

  static fromRecord(value: any) {
    return new Commit({
      name: value.name,
      org: value.org,
      db: value.db,
      content: value.content,
      oid: value.oid,
      blobMap: JSON.parse(value.blobMap),
    });
  }

  async save() {
    await this.db.insert(tables.commits).values({
      content: this.content,
      oid: this.oid,
      blobMap: JSON.stringify(this.blobMap),
    });
  }
}
