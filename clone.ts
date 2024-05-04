import { loadDatabase } from "~/services/git/database";
import { Repo, movieRepoPath, movieRepoConfig } from "~/services/git/git";
import { tables } from "~/services/git/schema";

const { db } = loadDatabase();

const clone = async () => {
  for await (const table of Object.values(tables)) {
    await db.delete(table).run();
  }
  await Repo.clone({
    ...movieRepoConfig,
    db,
    branchName: "main",
    dir: movieRepoPath,
  });
};

clone();
