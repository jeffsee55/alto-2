import { TreeType } from "./git";

export class GitBrowser {
  static async hash(str: any) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);

    // Use the SubtleCrypto API to hash the data
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  }

  static async readBlob(dir: string, oid: string) {
    return "fake blob";
  }

  static async _buildCommitTree(args: {
    dir: string;
    branch: string;
  }): Promise<TreeType> {
    return {};
  }

  static async _lsTree({ dir, ref }: { dir: string; ref: string }) {}
  static async _getCommitForBranch(args: { dir: string; branch: string }) {}

  static async clone(args: { dir: string; branchName: string }) {}
}
