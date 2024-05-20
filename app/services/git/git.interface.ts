import { TreeType } from "./types";
import { sep } from "path";
import type { ReadCommitResult } from "isomorphic-git";
import { Buffer } from "buffer";

export class GitBase {
  async hash(bufferOrString: Buffer | string): Promise<string> {
    let buffer: Buffer;
    if (!Buffer.isBuffer(bufferOrString)) {
      buffer = Buffer.from(bufferOrString);
    } else {
      buffer = bufferOrString;
    }
    return this._hash(buffer);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _hash(buffer: Buffer): Promise<string> {
    throw new Error(`Not implemented`);
  }

  async hashBlob(string: string) {
    return this.hash(this.wrap({ type: "blob", bufferOrString: string }));
  }

  wrap({
    type,
    bufferOrString,
  }: {
    type: string;
    bufferOrString: Buffer | string;
  }) {
    let buffer: Buffer;
    if (!Buffer.isBuffer(bufferOrString)) {
      buffer = Buffer.from(bufferOrString);
    } else {
      buffer = bufferOrString;
    }
    return Buffer.concat([
      Buffer.from(`${type} ${buffer.byteLength.toString()}\x00`),
      Buffer.from(buffer),
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async readBlob(dir: string, oid: string): Promise<string> {
    throw new Error(`Not implemented`);
  }
  async _buildCommitTree(args: {
    dir: string;
    branch: string;
  }): Promise<TreeType> {
    const ref = args.branch;
    const lsTree = await this._lsTree({ dir: args.dir, ref });
    const commitInfo = await this._getCommitForBranch({
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
      return tree;
    } else {
      throw new Error(`Unexepcted response from ls-tree for ref ${ref}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _lsTree(args: { dir: string; ref: string }): Promise<string> {
    throw new Error("Not implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _getCommitForBranch(args: {
    dir: string;
    branch: string;
  }): Promise<ReadCommitResult> {
    throw new Error("Not implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async clone(args: { remoteSource: string; branchName: string }): Promise<{
    branchName: string;
    dir: string;
    tree: TreeType;
    commit: {
      parents: string[];
      content: string;
      oid: string;
    };
  }> {
    throw new Error("Not implemented");
  }
}
