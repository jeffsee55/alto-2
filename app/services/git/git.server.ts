import * as git from "isomorphic-git";
import * as http from "isomorphic-git/http/node";
import fs from "fs";
import tmp from "tmp-promise";
import crypto from "crypto";
import { exec } from "child_process";
import { GitBase } from "./git.interface";

export class GitServer extends GitBase {
  async _hash(str: Buffer) {
    return crypto.createHash("sha1").update(str).digest("hex");
  }

  async readBlob(dir: string, oid: string) {
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
  async _getCommitForBranch(args: { dir: string; branch: string }) {
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

  async clone(args: { remoteSource: string; branchName: string }) {
    let dir = args.remoteSource;
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
    const commitInfo = await this._getCommitForBranch({
      dir: args.remoteSource,
      branch: args.branchName,
    });

    const tree = await this._buildCommitTree({
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
