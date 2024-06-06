import { it, expect } from "vitest";
import { GitExec, movieRepoPath } from "./git";

it("creates the correct commit hash", async () => {
  const tree = await GitExec.buildCommitTree({
    branch: "main",
    dir: movieRepoPath,
  });
  expect(JSON.stringify(tree, null, 2)).toMatchFileSnapshot(
    "commit-hash/1.json"
  );
});
