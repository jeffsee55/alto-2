import { GitBase } from "../git.interface";

export const common = {
  "hash algorithm 1 ": async (gitClient: GitBase) => {
    return {
      value: JSON.stringify(await gitClient.hash("hello, world")),
      file: "common/hash-algorithm.json",
    };
  },
  "hashes blobs": async (gitClient: GitBase) => {
    return {
      value: JSON.stringify(await gitClient.hashBlob("hello, world")),
      file: "common/hello-world-hash.json",
    };
  },
};
