import { it, expect } from "vitest";
import { GitExec } from "./git";

const message = "some commit content 3";
const movieRepoPath = "/Users/jeffsee/code/movie-content";

it("creates the correct commit hash", async () => {
  const commit = {
    message,
    dir: movieRepoPath,
  };
  const blobMapResult = await GitExec.buildCommitTree(commit);
  expect(JSON.stringify(blobMapResult, null, 2)).toMatchFileSnapshot(
    "commit-hash/1.json"
  );
});
