import * as git from "isomorphic-git";
import * as http from "isomorphic-git/http/node";
import fs from "fs";
import { exec } from "child_process";
import tmp from "tmp-promise";
import crypto from "crypto";
import { TreeType } from "./git";
import { sep } from "path";

export class GitServer {
  static hash(str: Buffer) {
    return crypto.createHash("sha1").update(str).digest("hex");
  }

  static async readBlob(dir: string, oid: string) {
    // Skipping unnecessary sha lookup
    // this is extremely fast when the objects are coming from a
    // pack file because the cache holds them in memory
    const res = await git.readObject({
      fs,
      dir,
      oid,
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

  static async _buildCommitTree(args: {
    dir: string;
    branch: string;
  }): Promise<TreeType> {
    const ref = args.branch;
    const lsTree = await GitServer._lsTree({ dir: args.dir, ref });
    const commitInfo = await GitServer._getCommitForBranch({
      dir: args.dir,
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

  static async _lsTree({ dir, ref }: { dir: string; ref: string }) {
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
  static async _getCommitForBranch(args: { dir: string; branch: string }) {
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

  static async clone(args: { dir: string; branchName: string }) {
    let dir = args.dir;
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

      dir = tmpDir.name;
    }
    // const pathToGitRepo = await fs.mkdtempSync(`${tmpDir.name}${sep}`);
    const commitInfo = await GitServer._getCommitForBranch({
      dir: args.dir,
      branch: args.branchName,
    });

    const tree = await GitServer._buildCommitTree({
      dir: dir,
      branch: args.branchName,
    });

    const cloneResult = {
      branchName: args.branchName,
      dir,
      tree,
      commit: {
        parents: commitInfo.commit.parent,
        content: commitInfo.commit.message,
        oid: commitInfo.oid,
      },
    };
    return cloneResult;
  }
}
