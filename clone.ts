import { loadDatabase } from "~/services/git/database";
import { Repo, movieRepoPath, movieRepoConfig } from "~/services/git/git";
import { GitServer } from "~/services/git/git.node";
import { tables } from "~/services/git/schema";

const { db } = loadDatabase();

const clone = async () => {
  for await (const table of Object.values(tables)) {
    await db.delete(table).run();
  }
  await Repo.clone({
    ...movieRepoConfig,
    db,
    exec: new GitServer(),
    branchName: "main",
    dir: movieRepoPath,
  });
};

clone();
