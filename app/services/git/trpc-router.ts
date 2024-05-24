import { tables } from "./schema";
import { publicProcedure, router } from "./trpc";
import { loadDatabase } from "./database";
import { z } from "zod";
import { Branch, GitExec, changesSchema } from "./git";
import { GitBrowser } from "./git.browser";

const { db } = loadDatabase();

export const appRouter = router({
  sync: publicProcedure
    .input(changesSchema)
    .mutation(async ({ input: { orgName, repoName, branchName, changes } }) => {
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
      await branch.syncChanges(changes);
    }),
  check: publicProcedure
    .input(
      z.object({
        orgName: z.string(),
        repoName: z.string(),
        branchName: z.string(),
      })
    )
    .query(async ({ input: { orgName, repoName, branchName } }) => {
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
      return { commitOid: branch.commitOid };
    }),
  dump: publicProcedure.query(async () => {
    const dump: Record<string, object> = {};
    for (const [tableName, table] of Object.entries(tables)) {
      const res = await db.select().from(table);
      console.log(`Dumping ${res.length} rows from ${tableName}`);
      dump[tableName] = res;
    }
    return dump;
  }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
