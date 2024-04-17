import fs from "fs";
import { schema } from "~/services/database/schema";
import path from "path";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

const log: typeof console.log = (...args) => {
  args;
  // console.log(...args);
};

function Err(name: string) {
  return class extends Error {
    code: string;
    constructor(...args: Parameters<typeof Error>) {
      super(...args);
      this.code = name;
      if (this.message) {
        this.message = name + ": " + this.message;
      } else {
        this.message = name;
      }
    }
  };
}

const ENOENT = Err("ENOENT");
// const EEXIST = Err("EEXIST");
// const ENOTDIR = Err("ENOTDIR");
// const ENOTEMPTY = Err("ENOTEMPTY");
// const ETIMEDOUT = Err("ETIMEDOUT");
// const EISDIR = Err("EISDIR");

export const createFs = (
  drizzleDB: BetterSQLite3Database<typeof schema>,
  repoId: string
) => {
  const splitAtGit = (path: string) => {
    return { repoId, name: path.substring(repoId.length + 1) };
  };
  return {
    promises: {
      chmod: async (...args: Parameters<typeof fs.promises.chmod>) => {
        throw new Error(`unknown usage chmod with arguments: ${args[0]}`);
      },
      copyFile: async (...args: Parameters<typeof fs.promises.copyFile>) => {
        throw new Error(`unknown usage copyfile with arguments: ${args[0]}`);
      },
      readlink: async (...args: Parameters<typeof fs.promises.readlink>) => {
        throw new Error(`unknown usage readlink with arguments: ${args[0]}`);
      },
      rmdir: async (...args: Parameters<typeof fs.promises.rmdir>) => {
        throw new Error(`unknown usage rmdir with arguments: ${args[0]}`);
      },
      symlink: async (...args: Parameters<typeof fs.promises.symlink>) => {
        throw new Error(`unknown usage symlink with arguments: ${args[0]}`);
      },
      lstat: async (...args: Parameters<typeof fs.promises.lstat>) => {
        const { repoId, name } = splitAtGit(args[0].toString());
        log(`lstat with argument:`, name);
        const result1 = await drizzleDB.query.files.findFirst({
          where: (fields, ops) =>
            ops.and(ops.eq(fields.repoId, repoId), ops.eq(fields.name, name)),
        });
        if (!result1) {
          throw new ENOENT(name);
        }
        const date = new Date(result1.birthtime);
        const isoDate = date.toISOString();
        const stat = {
          isFile: () => result1.isDirectory === 0,
          isDirectory: () => result1.isDirectory === 1,
          isSymbolicLink: () => false,
          size: result1.size,
          atimeMs: result1.birthtime,
          mtimeMs: result1.birthtime,
          ctimeMs: result1.birthtime,
          birthtimeMs: result1.birthtime,
          atime: isoDate,
          mtime: isoDate,
          ctime: isoDate,
          birthtime: isoDate,
        };
        return stat;
      },
      stat: async (...args: Parameters<typeof fs.promises.stat>) => {
        const { repoId, name } = splitAtGit(args[0].toString());
        splitAtGit(name);
        log(`stat with argument:`, name);
        const result1 = await drizzleDB.query.files.findFirst({
          where: (fields, ops) =>
            ops.and(ops.eq(fields.repoId, repoId), ops.eq(fields.name, name)),
        });
        if (!result1) {
          throw new ENOENT(name);
        }
        const stat = {
          isFile: () => result1.isDirectory === 0,
          isDirectory: () => result1.isDirectory === 1,
          isSymbolicLink: () => false,
          size: result1.size,
        };
        return stat;
      },
      unlink: async (...args: Parameters<typeof fs.promises.unlink>) => {
        log(`unlink with arguments:`, args);
        // throw new Error(`unknown usage unlink with arguments: ${args[0]}`);
        // TODO: cascade this deletion
        await drizzleDB
          .delete(schema.files)
          .where(eq(schema.files.name, args[0].toString()));
      },
      mkdir: async (...args: Parameters<typeof fs.promises.mkdir>) => {
        log(`mkdir with arguments:`, args);
        const { repoId, name } = splitAtGit(args[0].toString());
        const { dir, base } = path.parse(name);
        const birthtime = 1706724530491;
        await drizzleDB
          .insert(schema.files)
          .values({
            repoId,
            name: name.toString(),
            value: "",
            isDirectory: 1,
            base,
            dir,
            birthtime,
            size: 0,
            encoding: "na",
          })
          .onConflictDoNothing();
      },
      readdir: async (...args: Parameters<typeof fs.promises.readdir>) => {
        log(`readdir with arguments:`, args);
        const { repoId, name } = splitAtGit(args[0].toString());
        const children = (
          await drizzleDB.query.files.findMany({
            where: (fields, ops) =>
              ops.and(ops.eq(fields.repoId, repoId), ops.eq(fields.dir, name)),
            columns: { base: true },
          })
        ).map((child) => child.base);
        return children;
      },
      readFile: async (...args: Parameters<typeof fs.promises.readFile>) => {
        const { repoId, name } = splitAtGit(args[0].toString());
        if (name.endsWith(".pack")) {
          const dbResponse = await drizzleDB.query.fileParts.findMany({
            where: (fields, ops) =>
              ops.and(ops.eq(fields.repoId, repoId), ops.eq(fields.name, name)),
            orderBy: (fields) => fields.partNumber,
          });
          let value = "";
          dbResponse.forEach((item) => (value += item.value));
          return Buffer.concat(
            dbResponse.map((item) => Buffer.from(item.value, "base64"))
          );
          // return ;
        }
        const dbResponse = await drizzleDB.query.files.findFirst({
          where: (fields, ops) =>
            ops.and(ops.eq(fields.repoId, repoId), ops.eq(fields.name, name)),
        });
        if (!dbResponse) {
          // console.log(`Expected db to have value when reading file ${name}`);
          throw new ENOENT(name);
        }
        const dbValue =
          dbResponse?.encoding === "buffer"
            ? Buffer.from(dbResponse.value, "base64")
            : atob(dbResponse?.value);
        if (name.includes(".git/objects") && !name.includes(".idx")) {
          // console.log(name);
        }
        return dbValue;
      },
      writeFile: async (...args: Parameters<typeof fs.promises.writeFile>) => {
        const { repoId, name } = splitAtGit(args[0].toString());
        log(`writeFile with arguments:`, name);
        const value = args[1];
        const options = args[2];
        let encoding = "utf8";
        if (options) {
          if (typeof options !== "string") {
            if (options.encoding) {
              encoding = options.encoding;
            }
          }
        }
        const { dir, base } = path.parse(name.toString());
        const birthtime = 1706724530491;
        if (name.endsWith(".pack")) {
          if (value instanceof Buffer) {
            let i = 0;
            for await (const chunk of chunkBuffer(value, 10240)) {
              await drizzleDB
                .insert(schema.fileParts)
                .values({
                  repoId,
                  name: name.toString(),
                  value: chunk.toString("base64"),
                  partNumber: i,
                  birthtime,
                  base,
                  dir,
                  isDirectory: 0,
                  size: chunk.byteLength,
                  encoding: "buffer",
                })
                .onConflictDoUpdate({
                  target: [
                    schema.fileParts.name,
                    schema.fileParts.repoId,
                    schema.fileParts.partNumber,
                  ],
                  set: { value: chunk.toString("base64"), encoding: "buffer" },
                });
              i++;
            }
          }
        } else {
          if (typeof value === "string") {
            const size = Buffer.byteLength(value, "utf8");
            await drizzleDB
              .insert(schema.files)
              .values({
                repoId,
                name: name.toString(),
                value: btoa(value),
                isDirectory: 0,
                base,
                dir,
                birthtime,
                size,
                encoding,
              })
              .onConflictDoUpdate({
                target: [schema.files.name, schema.files.repoId],
                set: { value: btoa(value), encoding },
              });
          } else if (value instanceof Buffer) {
            await drizzleDB
              .insert(schema.files)
              .values({
                repoId,
                name: name.toString(),
                value: value.toString("base64"),
                birthtime,
                base,
                dir,
                isDirectory: 0,
                size: value.byteLength,
                encoding: "buffer",
              })
              .onConflictDoUpdate({
                target: [schema.files.name, schema.files.repoId],
                set: { value: value.toString("base64"), encoding: "buffer" },
              });
          } else {
            console.log(
              `Expected string for writeFile, but got ${typeof value} for ${name}`
            );
          }
        }
      },
    },
  };
};
async function* chunkBuffer(buffer: Buffer, chunkSize: number) {
  let offset = 0;

  while (offset < buffer.length) {
    const chunk = buffer.slice(offset, offset + chunkSize);
    yield chunk;
    offset += chunkSize;
    await new Promise((resolve) => setTimeout(resolve, 0)); // Simulate asynchronous operation
  }
}
