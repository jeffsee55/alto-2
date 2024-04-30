import { it, expect } from "vitest";
import { GitExec } from "./git";

const message = "some commit content 3";
const movieRepoPath = "/Users/jeffsee/code/movie-content";

it("creates the correct commit hash", async () => {
  const commit = {
    message,
    blobMap: {
      "content/movies/movie1.json": "d10bd1652a63dff25ee914613c573d650aa917d5",
      "content/movies/movie3.json": "a2427bbe87f5da045561e163936d50d80725f640",
    },
    dir: movieRepoPath,
  };
  const blobMapResult = await GitExec.buildCommitTree(commit);
  expect(JSON.stringify(blobMapResult, null, 2)).toMatchFileSnapshot(
    "commit-hash/1.json"
  );
});
