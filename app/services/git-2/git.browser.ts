import { GitBase } from "./git.interface";
import type { TreeType } from "./types";
import type { ReadCommitResult } from "isomorphic-git";

export class GitBrowser extends GitBase {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async readBlob(dir: string, oid: string): Promise<string> {
    throw new Error(`GitBrowser.readBlob not implemented`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _buildCommitTree(args: {
    dir: string;
    branch: string;
  }): Promise<TreeType> {
    throw new Error(`GitBrowser._buildCommitTree not implemented`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _lsTree({ dir, ref }: { dir: string; ref: string }): Promise<string> {
    throw new Error(`GitBrowser._lsTree not implemented`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _getCommitForBranch(args: {
    dir: string;
    branch: string;
  }): Promise<ReadCommitResult> {
    throw new Error(`GitBrowser._getCommitForBranch not implemented`);
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
    throw new Error(`GitBrowser.clone not implemented`);
  }
}
