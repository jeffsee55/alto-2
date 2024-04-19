import * as git from "~/services/isomorphic-git/src/index.js";
import isoHTTP from "~/services/isomorphic-git/src/http/node";
import { schema } from "~/services/database/schema";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createGitURL } from "./git-server";
import { createFs } from "./fs";
import { and, eq, like, not } from "drizzle-orm";

export class Repo {
  drizzleDB: BetterSQLite3Database<typeof schema>;
  dir: string;
  fs: ReturnType<typeof createFs>;
  remoteSource: "github" | "local";
  remoteURL: string;

  constructor(drizzleDB: BetterSQLite3Database<typeof schema>, dir: string) {
    this.remoteSource = dir.startsWith("https://github.com")
      ? "github"
      : "local";
    this.remoteURL = dir.startsWith("https://github.com") ? dir : dir;
    const githubURL = dir.startsWith("https://github.com")
      ? new URL(dir)
      : { host: "", pathname: "" };
    this.dir = dir.startsWith("https://github.com")
      ? `${githubURL.host}${githubURL.pathname}`
      : dir;
    this.drizzleDB = drizzleDB;
    this.fs = createFs(drizzleDB, this.dir);
  }

  async glob(pattern: string, ref: string) {
    function globToRegex(glob: string): RegExp {
      const regexString = glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special chars
        .replace(/\*/g, ".*") // Replace * with .*
        .replace(/\?/g, "."); // Replace ? with .

      return new RegExp("^" + regexString + "$", "i");
    }
    const regex = globToRegex(pattern);
    const cache = {};
    const files = await git.listFiles({
      fs: this.fs,
      dir: this.dir,
      ref,
      cache,
    });
    return files.filter((file) => regex.test(file));
  }

  async hashBlob(args: Omit<Parameters<typeof git.hashBlob>[0], "fs" | "dir">) {
    return git.hashBlob(args);
  }

  async writeBlob(
    args: Omit<Parameters<typeof git.writeBlob>[0], "fs" | "dir">
  ) {
    return git.writeBlob({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }
  async readTree(args: Omit<Parameters<typeof git.readTree>[0], "fs" | "dir">) {
    return git.readTree({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }
  async readCommit(
    args: Omit<Parameters<typeof git.readCommit>[0], "fs" | "dir">
  ) {
    return git.readCommit({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }

  async merge(args: Omit<Parameters<typeof git.merge>[0], "fs" | "dir">) {
    return git.merge({
      fs: this.fs,
      dir: this.dir,
      author: {
        email: "mrtest@example.com",
        name: "Mr Tester",
        timestamp: 1706724530491, // keeping this consistent makes test shas predictable
      },
      ...args,
    });
  }

  async writeTree(
    args: Omit<Parameters<typeof git.writeTree>[0], "fs" | "dir">
  ) {
    return git.writeTree({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }
  async writeRef(args: Omit<Parameters<typeof git.writeRef>[0], "fs" | "dir">) {
    return git.writeRef({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }
  async writeCommit(
    args: Omit<Parameters<typeof git.writeCommit>[0], "fs" | "dir">
  ) {
    return git.writeCommit({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }

  async readBlob(args: Omit<Parameters<typeof git.readBlob>[0], "fs" | "dir">) {
    return git.readBlob({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }

  async readObject(
    args: Omit<Parameters<typeof git.readObject>[0], "fs" | "dir">
  ) {
    return git.readObject({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }
  async fastList({ ref }) {
    console.time(`time elapsed`);
    const matrix = await git.statusMatrix({
      fs: this.fs,
      dir: this.dir,
      ref,
      filter: (f) => f.endsWith(".json") || f.endsWith(".md"),
    });
    let files = 0;
    for (const [filepath, head, workdir, stage] of matrix) {
      // console.log(`${filepath}: ${head} ${workdir} ${stage}`)
      files++;
    }
    console.log("files listed", files);
    console.timeEnd(`time elapsed`);
  }
  async direct({ ref }) {
    const commitOid = await git.resolveRef({
      fs: this.fs,
      dir: this.dir,
      ref,
    });
    // const commit = await git.readCommit({
    //   fs: this.fs,
    //   dir: this.dir,
    //   oid: commitOid,
    // });
    // console.log(commit);
    // await this.readCommit({fs: this.fs, dir: this.dir,  })
    // console.log(commit);
    // const commit2 = await git.writeCommit({
    //   fs: {
    //     promises: {
    //       ...this.fs.promises,
    //       writeFile: async (...args) => {
    //         console.log("args", args);
    //         return {};
    //       },
    //     },
    //   },
    //   dir: this.dir,
    //   commit: commit.commit,
    // });
    const meh = git.TREE({ ref });
    const oids: string[] = [commitOid];
    await git.walk({
      fs: this.fs,
      dir: this.dir,
      trees: [meh],
      reduce: async ([entry]) => {
        const oid = await entry.oid();
        const type = await entry.type();
        if (type === "tree") {
          oids.push(oid);
        }
        if (type === "blob") {
          const content = await entry.content();
          await git.writeBlob({ fs: this.fs, dir: this.dir, blob: content });
        }
      },
    });
    // console.log(oids);
    const res = await git.packObjects({
      fs: this.fs,
      dir: this.dir,
      write: true,
      oids,
    });
    await git.indexPack({
      fs: this.fs,
      dir: this.dir,
      filepath: `.git/objects/pack/${res.filename}`,
    });

    await this.drizzleDB
      .delete(schema.files)
      .where(
        and(
          eq(schema.files.repoId, this.dir),
          like(schema.files.name, `%.idx`),
          not(
            eq(
              schema.files.name,
              `.git/objects/pack/${res.filename.replace(".pack", ".idx")}`
            )
          )
        )
      );
    await this.drizzleDB
      .delete(schema.fileParts)
      .where(
        and(
          eq(schema.fileParts.repoId, this.dir),
          not(eq(schema.fileParts.name, `.git/objects/pack/${res.filename}`))
        )
      );
    // packfiles = packfiles.filter((name) => name.endsWith(".pack"));
    // console.log("packfiles", packfiles);
    // const commit = await git.readCommit({
    //   fs: this.fs,
    //   dir: this.dir,
    //   oid: commitOid,
    // });
    // console.log(commit);
  }

  async add(args: Omit<Parameters<typeof git.add>[0], "fs" | "dir">) {
    return git.add({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }

  async listFiles(args: { ref: string }) {
    const cache = {};
    const res = await git.listFiles({
      fs: this.fs,
      dir: this.dir,
      ref: args.ref,
      cache,
    });
    return res;
  }
  async status(args: Omit<Parameters<typeof git.status>[0], "fs" | "dir">) {
    return git.status({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }
  async statusMatrix(
    args: Omit<Parameters<typeof git.statusMatrix>[0], "fs" | "dir">
  ) {
    return git.statusMatrix({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }

  async branch(args: Omit<Parameters<typeof git.branch>[0], "fs" | "dir">) {
    return git.branch({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }

  async listBranches(
    args: Omit<Parameters<typeof git.listBranches>[0], "fs" | "dir">
  ) {
    return git.listBranches({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }
  async resolveRef(
    args: Omit<Parameters<typeof git.resolveRef>[0], "fs" | "dir">
  ) {
    return git.resolveRef({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }

  async log(args: Omit<Parameters<typeof git.log>[0], "fs" | "dir">) {
    return git.log({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }

  async commit(args: Omit<Parameters<typeof git.commit>[0], "fs" | "dir">) {
    // const fs = createFs(this.drizzleDB, this.dir, { action: "committing" });
    return git.commit({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }

  async checkout(args: Omit<Parameters<typeof git.checkout>[0], "fs" | "dir">) {
    const ref = args?.ref;
    if (!ref) {
      throw new Error(`No ref provided for git checkout`);
    }
    await git.checkout({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
    // return git.resolveRef({
    //   fs: this.fs,
    //   dir: this.dir,
    //   ref,
    // });
  }

  /**
   * This is very slow (500ms on medium-size repo) because readBlob has to make a lot
   * of round trips to the database to find the actual blob. This is used in 2 places:
   *
   * 1. The asset API, it's probably necessary that this doesn't change
   * 2. The import process. It's sort of obvious that we could just pass this
   *    down to an actual git child process to speed it up when working locally.
   *    but on CI for separate content repos, would we need to clone the whole repo
   *    in order to do this? It might also be worth using an in-memory k/v store
   *    for the import phase with iso git.
   */
  async get(args: {
    filepath: string;
    ref: string;
    cache?: object;
  }): Promise<{ blob: Uint8Array; string: string; sha: string }> {
    const oid = await git.resolveRef({
      fs: this.fs,
      dir: this.dir,
      ref: args.ref,
    });
    const { blob, oid: blobOid } = await git.readBlob({
      fs: this.fs,
      dir: this.dir,
      oid,
      filepath: args.filepath,
      cache: args.cache,
    });
    const string = Buffer.from(blob).toString("utf8");
    return {
      blob: blob,
      string,
      sha: blobOid,
    };
  }

  async init(args: Omit<Parameters<typeof git.init>[0], "fs" | "dir">) {
    return git.init({
      fs: this.fs,
      dir: this.dir,
      ...args,
    });
  }
  async push({ ref }: { ref: string }) {
    const { url, http } =
      this.remoteSource === "github"
        ? { url: this.remoteURL, http: isoHTTP }
        : createGitURL({ urlOrPath: this.dir });

    return git.push({
      fs: this.fs,
      dir: this.dir,
      http,
      url,
      ref,
    });
  }

  async fetch(args: { ref: string }) {
    const { url, http } =
      this.remoteSource === "github"
        ? { url: this.remoteURL, http: isoHTTP }
        : createGitURL({ urlOrPath: this.dir });
    return git.fetch({
      http,
      url,
      dir: this.dir,
      fs: this.fs,
      ref: args?.ref,
      singleBranch: true,
      depth: 1,
      tags: false,
    });
  }

  async clone(args?: { ref: string; force?: boolean }) {
    const { url, http } =
      this.remoteSource === "github"
        ? { url: this.remoteURL, http: isoHTTP }
        : createGitURL({ urlOrPath: this.dir });
    const existing = await this.drizzleDB.query.repos.findFirst({
      where: (fields, ops) => ops.eq(fields.id, this.dir),
    });
    if (existing) {
      if (args?.force) {
        await this.drizzleDB
          .delete(schema.repos)
          .where(eq(schema.repos.id, this.dir));
      } else {
        throw new RepoError(
          `Unable to clone ${this.dir}, repo already cloned.`
        );
      }
    }
    await this.drizzleDB.insert(schema.repos).values({ id: this.dir });
    const cache = {};
    const done = await git.clone({
      fs: this.fs,
      http,
      url,
      noCheckout: true,
      depth: 1,
      dir: this.dir,
      ref: args?.ref,
      cache,
    });
    return done;
  }
}

export class RepoError extends Error {
  constructor(message: string) {
    super(message); // Call the super constructor with the error message
    this.name = this.constructor.name; // Set the name of the error to the class name
    Object.setPrototypeOf(this, RepoError.prototype); // Ensure proper prototype chain
  }
}
