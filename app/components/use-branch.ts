import { Params } from "@remix-run/react";
import { z } from "zod";
import { Branch, GitExec } from "~/services/git/git";
import { GitBrowser } from "~/services/git/git.browser";

export const getBranch = async (params: Readonly<Params<string>>) => {
  const { orgName, repoName, branchName } = z
    .object({
      orgName: z.string(),
      repoName: z.string(),
      branchName: z.string(),
      "*": z.string(),
    })
    .parse(params);
  const db = window.getAlto().db;

  const gitExec = new GitExec({
    db: db,
    orgName,
    repoName,
    exec: new GitBrowser(),
    remoteSource: "/Users/jeffsee/code/movie-content",
  });
  const branchRecord = await db.query.branches.findFirst({
    where(fields, ops) {
      return ops.and(
        ops.eq(fields.orgName, orgName),
        ops.eq(fields.repoName, repoName),
        ops.eq(fields.branchName, branchName)
      );
    },
  });
  if (!branchRecord) {
    throw new Error(`Branch ${branchName} not found`);
  }
  const branch = Branch.fromRecord({
    db: db,
    gitExec,
    ...branchRecord,
  });
  return branch;
};
