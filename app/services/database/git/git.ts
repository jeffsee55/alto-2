import { exec } from "child_process";
import fs from "fs";
import path from "path";
import * as git from "isomorphic-git";
import { ENOENT } from "./fs";
import { Database } from "..";
import { schema } from "../schema";
import { expect, onTestFailed } from "vitest";
import zlib from "zlib";
import pako from "pako";
import { GitTree } from "~/services/isomorphic-git/src/models/GitTree";
import { _writeObject } from "~/services/isomorphic-git/src/storage/writeObject";
import { shasum } from "~/services/isomorphic-git/src/utils/shasum";
import { GitObject } from "~/services/isomorphic-git/src/models/GitObject";
import crypto from "crypto";
import { toHex } from "~/services/isomorphic-git/src/utils/toHex";
import { GitCommit } from "~/services/isomorphic-git/src/models/GitCommit";

export class GitExec {
  database: Database;
  cache: Record<string, unknown>;
  constructor(database: Database) {
    this.database = database;
    this.cache = {};
  }

  async clone({ ref, dir }: { ref: string; dir: string }) {
    const stdout = await this.lsTree({ ref, dir });
    const oid = await git.resolveRef({ fs, dir, ref: ref });
    const commit = await git.readCommit({ fs: fs, dir, oid });

    const treeResult = await this.buildTree2({
      stdout,
      topLevelSha: commit.commit.tree,
      dir: dir,
    });
    console.log("tree built", Object.keys(treeResult.trees).length);

    const shaTree: Record<string, string> = {};
    for await (const [treeSha, entries] of Object.entries(treeResult.trees)) {
      shaTree[treeSha] = await this.writeTree({
        expectedSha: treeSha,
        entryShas: entries,
        dir,
      });
    }

    console.log("writing sha tree");

    const sha = await this.getShaForRef({ ref, dir });
    try {
      await this.database._db.insert(schema.trees).values({
        sha: commit.commit.tree,
        content: JSON.stringify(treeResult.tree),
        commit: "nothing",
        lsTree: JSON.stringify(treeResult.lsTree),
        lsTreeReversed: JSON.stringify(treeResult.lsTreeReversed),
        shaTree: JSON.stringify(shaTree),
      });
    } catch (e) {
      console.log(e);
    }
    console.log("writing blobs");
    let count = 0;
    onTestFailed(() => {
      console.log("count", count);
    });
    for await (const [sha, filepath] of Object.entries(treeResult.blobMap)) {
      if (filepath.endsWith("json") || filepath.endsWith("md")) {
        try {
          const value = await this.readBlobFromSha({
            sha: sha,
            dir,
          });
          count++;
          const size = Buffer.byteLength(value, "utf8");
          const { dir: pDir, base } = path.parse(filepath);
          const birthtime = 1706724530491;
          const encoding = "utf8";
          await this.database._db.insert(schema.blobs).values({
            sha: sha,
            content: value,
          });
          await this.database._db.insert(schema.files).values({
            repoId: dir,
            name: filepath,
            value: value,
            isDirectory: 0,
            base,
            dir: pDir,
            birthtime,
            size,
            encoding,
          });
        } catch (e) {
          console.log(`Error while resolving blob ${ref}`);
        }
      }
    }
    await this.database._db
      .insert(schema.refs)
      .values({ name: ref, sha: commit.commit.tree, type: "branch" })
      .onConflictDoUpdate({
        target: schema.refs.name,
        set: { name: ref },
      });
    console.log("done cloning", count);
  }

  getShaForRef({ ref, dir }: { ref: string; dir: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      // Execute git rev-parse command to get the SHA hash for the reference
      exec(`git rev-parse ${ref}`, { cwd: dir }, (error, stdout, stderr) => {
        if (error) {
          reject(stderr || error.message);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  async readBlobFromSha({
    sha,
    dir,
  }: {
    sha: string;
    dir: string;
  }): Promise<string> {
    // Skipping unnecessary sha lookup
    // this is extremely fast when the objects are coming from a
    // pack file because the cache holds them in memory
    const res = await git.readObject({ fs, dir, oid: sha, cache: this.cache });
    return Buffer.from(res.object).toString("utf8");
  }

  async catFileP({ ref, dir }: { ref: string; dir: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        `git cat-file -p ${ref}`,
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
  async lsTree({ ref, dir }: { ref: string; dir: string }): Promise<string> {
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

  async writeTree({
    expectedSha,
    entryShas,
    dir,
  }: {
    expectedSha: string;
    entryShas: {
      mode: string;
      path: string;
      oid: string;
      type: "tree" | "blob";
    }[];
    dir: string;
  }) {
    const gitTree = new GitTree(entryShas);
    const gitTreeObject = gitTree.toObject();
    const object = GitObject.wrap({ type: "tree", object: gitTreeObject });
    const oid2 = await shasum(object);
    if (expectedSha !== oid2) {
      throw new Error(`Expected sha mismatch ${expectedSha} : ${oid2}`);
    }
    return gitTreeObject;
    // return buffer;
  }

  async buildTree2({
    stdout,
    // lines,
    topLevelSha,
    dir,
  }: {
    stdout: string;
    topLevelSha: string;
    dir: string;
  }) {
    const lines = stdout.trim().split("\n");
    const lsTree: Record<string, string> = {};
    const lsTreeReversed: Record<string, string> = {};
    const jsonLines: ObjectInfo[] = [];
    const treeEntries: {
      treeSha: string;
      sha;
      filepath: string;
      type: string;
    }[] = [];
    lines.forEach((line) => {
      const [ok, filepathDirty] = line.split("\t");
      const [mode, type, sha] = ok.split(" ");
      const filepath = filepathDirty.replace(/^"|"$/g, "");
      if (type === "blob" || type === "tree") {
        lsTree[filepath] = sha;
        lsTreeReversed[sha] = filepath;
        jsonLines.push({ mode, type, sha, filepath });
        treeEntries.push({ treeSha: topLevelSha, type, sha, filepath });
      }
    });
    // console.log(jsonLines);
    for (let i = 0; i < treeEntries.length; i += 1000) {
      const chunk = treeEntries.slice(i, i + 1000);
      await this.database._db.insert(schema.treeEntries).values(chunk);
      // await processChunk(chunk);
    }
    const treeMap: Record<string, string> = {};
    const blobMap: Record<string, string> = {};
    const topLevelTree: TreeNode = {
      mode: "040000",
      type: "tree",
      sha: topLevelSha,
      filepath: ".",
      entries: {},
    };
    const trees: Record<
      string,
      {
        mode: string;
        type: "tree" | "blob";
        oid: string;
        path: string;
      }[]
    > = { [topLevelSha]: [] };
    jsonLines.forEach((line) => {
      let currentTree = topLevelTree;
      const pathParts = line.filepath.split(path.sep);
      pathParts.map((part, i) => {
        if (i === pathParts.length - 1) {
          // we'r at the end
          const value = {
            ...line,
            relativePath: part,
          };
          const valueWithEntries =
            line.type === "tree" ? { ...value, entries: {} } : value;
          if (currentTree.entries) {
            currentTree.entries[part] = valueWithEntries;
          }

          if (line.type === "tree") {
            trees[line.sha] = [];
          }
          if (line.type === "blob") {
            blobMap[line.sha] = line.filepath;
          }
          if (part.endsWith(`"`) && !part.startsWith(`"`)) {
            console.log(line);
          }
          if (line.filepath.includes("manage-content-wordpress")) {
            // line.filepath = `"${line.filepath}"`;
            part = "2019-11-07-еxploring-new-ways-manage-content-wordpress.md";
            // part = `"${part}"`;
          }
          trees[currentTree.sha].push({
            mode: line.mode,
            path: part,
            oid: line.sha,
            type: line.type,
          });
        } else {
          if (currentTree.entries) {
            if (part in currentTree.entries) {
              currentTree = currentTree?.entries[part];
            }
          }
        }
      });
    });
    // console.dir(trees, { depth: null });
    for await (const [expectedSha, entryShas] of Object.entries(trees)) {
      treeMap[expectedSha] = await this.writeTree({
        dir,
        expectedSha,
        entryShas,
      });
    }
    return {
      tree: topLevelTree,
      trees,
      treeMap,
      blobMap,
      lsTree,
      lsTreeReversed,
    };
  }
  async writeCommit({
    dir,
    expectedOid,
  }: {
    expectedOid: string;
    dir: string;
  }) {
    let commitCompressed: string = "";
    const oid = await git.resolveRef({ fs, dir, ref: "master" });
    const commit = await git.readCommit({ fs, dir, oid });
    const gitCommit = GitCommit.from(commit.commit);
    const gitCommitObject = gitCommit.toObject();
    const object = GitObject.wrap({ type: "commit", object: gitCommitObject });
    const oid2 = await shasum(object);
    console.log(commit.commit);

    // console.log(oid, commit.oid, oid2);
    if (oid2 !== commit.oid) {
      console.log("oh no!", oid2);
      throw new Error(`Commit sha mismatch ${expectedOid} : ${oid2}`);
    }
    return commitCompressed;
  }
}

interface ObjectInfo {
  mode: string;
  type: "tree" | "blob";
  sha: string;
  filepath: string;
}

interface TreeNode {
  mode: string;
  type: string;
  sha: string;
  filepath: string;
  entries?: { [key: string]: TreeNode | ObjectInfo };
}
// trees[node.sha] = node.entries;
