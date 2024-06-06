import type { TreeType, DB } from "../types";
import { sep } from "path";
import * as git from "isomorphic-git";
import { tables } from "../schema";
import fs from "fs";
import { exec } from "child_process";
import { Repo, Commit, Branch } from "../git";

export class FilesystemRepo extends Repo {
  db: DB;
  dir: string;
  constructor(args: { db: DB; dir: string }) {
    super(args);
    this.db = args.db;
    this.dir = args.dir;
  }
  dbInfo() {
    return { orgName: "filesystem", repoName: this.dir };
  }
  async save() {
    await this.db.insert(tables.repos).values({
      ...this.dbInfo(),
      remoteUrl: this.dir,
    });
  }
  static async clone(args: { db: DB; dir: string; branch: string }) {
    const repo = new FilesystemRepo(args);
    await repo.save();
    const commitOid = await git.resolveRef({
      fs,
      dir: args.dir,
      ref: args.branch,
    });

    if (typeof commitOid !== "string") {
      throw new Error(`Expected commit oid to be a string, got ${commitOid}`);
    }

    const commitFromGit = await git.readCommit({
      fs,
      dir: args.dir,
      oid: commitOid,
    });

    const lsTree = await repo._lsTree({ dir: args.dir, ref: args.branch });
    if (typeof lsTree === "string") {
      const lines = lsTree.split("\n");

      const tree: TreeType = {
        type: "tree",
        mode: "040000",
        oid: commitFromGit.commit.tree,
        name: ".",
        path: ".",
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
                  path: filepath,
                  entries: {},
                };
              } else {
                currentTree[part] = {
                  type: "blob",
                  mode: "100644",
                  oid,
                  name: lastPart,
                  path: filepath,
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
      const commit = new Commit({
        repo,
        tree,
        message: commitFromGit.commit.message,
        oid: commitFromGit.oid,
        timestamp: commitFromGit.commit.author.timestamp,
        timezoneOffset: commitFromGit.commit.author.timezoneOffset,
        treeOid: commitFromGit.commit.tree,
        authorName: commitFromGit.commit.author.name,
        authorEmail: commitFromGit.commit.author.email,
      });
      await commit.save();
      const branch = await Branch.create({
        repo,
        commit,
        branchName: args.branch,
      });
      return { repo, branch, commit };
    } else {
      throw new Error(
        `Unexepcted response from ls-tree for ref ${args.branch}`
      );
    }
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
