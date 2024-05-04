import { loadDatabase } from "~/services/git/database";
import { GitExec, Repo } from "~/services/git/git";
import { tables } from "~/services/git/schema";

const movieRepoPath = "/Users/jeffsee/code/movie-content";
const { db } = loadDatabase();

const clone = async () => {
  for await (const table of Object.values(tables)) {
    await db.delete(table).run();
  }
  console.log("cloning...");
  const gitExec = new GitExec({
    orgName: "jeffsee55",
    repoName: "movie-content",
    dir: movieRepoPath,
    db,
  });
  await Repo.clone({
    orgName: "jeffsee55",
    repoName: "movie-content",
    db,
    branchName: "main",
    gitExec,
  });
};

clone();
