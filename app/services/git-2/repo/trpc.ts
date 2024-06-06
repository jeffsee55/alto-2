import type { TreeType, DB } from "../types";
import { sep } from "path";
import { tables } from "../schema";
import { exec } from "child_process";
import { Repo, Commit, Branch } from "../git";
import { createCaller } from "./trpc-router";

export class TrpcRepo extends Repo {
  db: DB;
  orgName: string;
  repoName: string;
  trpc: ReturnType<typeof createCaller>;
  constructor(args: {
    db: DB;
    trpc: ReturnType<typeof createCaller>;
    orgName: string;
    repoName: string;
    branchName: string;
  }) {
    super(args);
    this.db = args.db;
    this.trpc = args.trpc;
    this.orgName = args.orgName;
    this.repoName = args.repoName;
  }
  dbInfo() {
    return { orgName: this.orgName, repoName: this.repoName };
  }
  async save() {
    await this.db.insert(tables.repos).values({
      ...this.dbInfo(),
      remoteUrl: "not-sure",
    });
  }
  async resolveRef(args: {
    orgName: string;
    repoName: string;
    branchName: string;
  }): Promise<string> {
    return this.trpc.resolveRef(args);
  }
  async readCommit(args: { oid: string }) {
    return this.trpc.readCommit({
      oid: args.oid,
    });
  }
  static async clone(args: {
    db: DB;
    orgName: string;
    repoName: string;
    branchName: string;
    trpc: ReturnType<typeof createCaller>;
  }) {
    const repo = new TrpcRepo(args);
    await repo.save();
    const commitOid = await repo.resolveRef({
      orgName: args.orgName,
      repoName: args.repoName,
      branchName: args.branchName,
    });

    if (typeof commitOid !== "string") {
      throw new Error(`Expected commit oid to be a string, got ${commitOid}`);
    }

    const commitFromGit = await repo.readCommit({
      oid: commitOid,
    });

    const commit = Commit.fromJSON(repo, commitFromGit);
    await commit.save();
    const branch = await Branch.create({
      repo,
      commit,
      branchName: args.branchName,
    });
    return { repo, branch, commit };
  }

  async clone() {
    throw new Error(`Not implemented`);
  }

  async fetch() {
    throw new Error(`Not implemented`);
  }

  async _lsTree({ dir, ref }: { dir: string; ref: string }): Promise<string> {
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
}
