import { z } from "zod";
import { tables } from "./schema";

import type { DB } from "./types";

export class Repo {
  db: DB;
  constructor(args: { db: DB }) {
    this.db = args.db;
  }

  static async clone(
    args: any
  ): Promise<{ repo: Repo; branch: Branch; commit: Commit }> {
    throw new Error(`Not implemented`);
  }

  dbInfo(): { orgName: string; repoName: string } {
    throw new Error(`Not implemented`);
  }
  async resolveRef(args: {
    orgName: string;
    repoName: string;
    branchName: string;
  }): Promise<string> {
    throw new Error(`Not implemented`);
  }
  async readCommit(args: { oid: string }): Promise<any> {
    throw new Error(`Not implemented`);
  }

  async clone() {
    throw new Error(`Not implemented`);
  }
  async fetch() {
    throw new Error(`Not implemented`);
  }
}

export class Branch {
  repo: Repo;
  commitOid: string;
  branchName: string;
  constructor(args: { repo: Repo; branchName: string; commitOid: string }) {
    this.repo = args.repo;
    this.branchName = args.branchName;
    this.commitOid = args.commitOid;
  }
  async currentCommit(): Promise<Commit> {
    return Commit.find({ repo: this.repo, commitOid: this.commitOid });
  }
  static async find(args: { repo: Repo; branchName: string }) {
    const record = await args.repo.db.query.branches.findFirst({
      where: (f, o) => o.and(o.eq(f.branchName, args.branchName)),
    });
    if (!record)
      throw new Error(`Branch not found for name ${args.branchName}`);

    return Branch.fromRecord({ repo: args.repo, record });
  }

  static async fromRecord(args: {
    repo: Repo;
    record: NonNullable<
      Awaited<ReturnType<DB["query"]["branches"]["findFirst"]>>
    >;
  }) {
    return new Branch({
      repo: args.repo,
      branchName: args.record.branchName,
      commitOid: args.record.commitOid,
    });
  }
  static async create(args: {
    repo: Repo;
    commit: Commit;
    branchName: string;
  }) {
    const branch = new Branch({
      repo: args.repo,
      commitOid: args.commit.oid,
      branchName: args.branchName,
    });
    await branch.save();
    return branch;
  }
  async save() {
    await this.repo.db.insert(tables.branches).values({
      ...this.repo.dbInfo(),
      commitOid: this.commitOid,
      branchName: this.branchName,
    });
  }
}

export class Commit {
  tree: TreeType;
  repo: Repo;
  message: string;
  oid: string;
  treeOid: string;
  parent: string | null;
  seondParent: string | null;
  authorName: string;
  authorEmail: string;
  timestamp: number;
  timezoneOffset: number;

  constructor(args: {
    repo: Repo;
    tree: TreeType;
    message: string;
    oid: string;
    treeOid: string;
    parents?: string[];
    authorName: string;
    authorEmail: string;
    timestamp: number;
    timezoneOffset: number;
  }) {
    this.repo = args.repo;
    this.tree = args.tree;
    this.oid = args.oid;
    this.message = args.message;
    this.treeOid = args.treeOid;
    this.parent = args?.parents?.at(0) || null;
    this.seondParent = args?.parents?.at(1) || null;
    this.authorName = args.authorName;
    this.authorEmail = args.authorEmail;
    this.timestamp = args.timestamp;
    this.timezoneOffset = args.timezoneOffset;
  }

  static fromJSON(
    repo: Repo,
    json: {
      tree: string;
      message: string;
      oid: string;
      treeOid: string;
      parent: string | null;
      secondParent: string | null;
      authorName: string;
      authorEmail: string;
      timestamp: number;
      timezoneOffset: number;
    }
  ) {
    return new Commit({
      repo: repo,
      tree: treeSchema.parse(JSON.parse(json.tree)),
      message: json.message,
      oid: json.oid,
      treeOid: json.treeOid,
      parents: [json.parent, json.secondParent].filter(Boolean),
      authorName: json.authorName,
      authorEmail: json.authorEmail,
      timestamp: json.timestamp,
      timezoneOffset: json.timezoneOffset,
    });
  }

  toJSON() {
    return {
      tree: JSON.stringify(this.tree),
      message: this.message,
      oid: this.oid,
      treeOid: this.treeOid,
      parent: this.parent,
      secondParent: this.seondParent,
      authorName: this.authorName,
      authorEmail: this.authorEmail,
      timestamp: this.timestamp,
      timezoneOffset: this.timezoneOffset,
    };
  }

  static async find(args: { repo: Repo; commitOid: string }) {
    const all = await args.repo.db.query.commits.findMany();
    const record = await args.repo.db.query.commits.findFirst({
      where: (f, o) => o.eq(f.oid, args.commitOid),
    });
    if (!record) throw new Error(`Commit not found for oid ${args.commitOid}`);

    return Commit.fromRecord({ repo: args.repo, record });
  }

  static async fromRecord(args: {
    repo: Repo;
    record: NonNullable<
      Awaited<ReturnType<DB["query"]["commits"]["findFirst"]>>
    >;
  }) {
    return new Commit({
      repo: args.repo,
      tree: treeSchema.parse(JSON.parse(args.record.tree)), // might lead to perf issues
      message: args.record.message,
      oid: args.record.oid,
      treeOid: args.record.treeOid,
      authorName: args.record.authorName,
      authorEmail: args.record.authorEmail,
      timestamp: args.record.timestamp,
      timezoneOffset: args.record.timezoneOffset,
    });
  }

  async save() {
    await this.repo.db.insert(tables.commits).values({
      message: this.message,
      oid: this.oid,
      tree: JSON.stringify(this.tree),
      treeOid: "treeOid",
      parent: this.parent,
      secondParent: this.seondParent,
      authorName: this.authorName,
      authorEmail: this.authorEmail,
      timestamp: this.timestamp,
      timezoneOffset: this.timezoneOffset,
    });
  }
}

const blobSchema = z.object({
  type: z.literal("blob"),
  mode: z.literal("100644"),
  oid: z.string(),
  name: z.string(),
  path: z.string(),
});

const treeSchemaBase = z.object({
  type: z.literal("tree"),
  mode: z.literal("040000"),
  name: z.string(),
  path: z.string(),
  oid: z.string(),
});

type TreeType = z.infer<typeof treeSchemaBase> & {
  entries: Record<string, TreeType | z.infer<typeof blobSchema>>;
};

const treeSchema: z.ZodType<TreeType> = treeSchemaBase.extend({
  entries: z.lazy(() => z.record(z.union([treeSchema, blobSchema]))),
});

// type TreeType = z.infer<typeof treeSchema>;
