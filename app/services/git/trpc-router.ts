import { tables } from "./schema";
import { z } from "zod";
import { Branch, GitExec, changesSchema } from "./git";
import { GitBrowser } from "./git.browser";
import { initTRPC } from "@trpc/server";
import type { Context } from "./trpc-context";

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create();

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const appRouter = router({
  sync: publicProcedure
    .input(changesSchema)
    .mutation(
      async ({
        input: { orgName, repoName, branchName, changes },
        ctx: { db },
      }) => {
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
        await branch.syncChanges({ direction: "ahead", changes });
      }
    ),
  commitCallback: publicProcedure
    .input(
      z.object({
        orgName: z.string(),
        repoName: z.string(),
        branchName: z.string(),
        commit: z.object({
          oid: z.string(),
        }),
      })
    )
    .query(
      async ({ input: { orgName, repoName, branchName }, ctx: { db } }) => {
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
        const currentCommit = await branch.currentCommit();
        let foundCommit = null;
        await currentCommit.walkParents(async (commit) => {
          if (commit.oid === commit.oid) {
            foundCommit = commit;
            return true;
          }
          return false;
        });
        const changes = await branch.changesSince(foundCommit.oid);

        return {
          foundCommit: foundCommit.oid,
          changes,
          currentCommit: currentCommit.oid,
        };
      }
    ),
  check: publicProcedure
    .input(
      z.object({
        orgName: z.string(),
        repoName: z.string(),
        branchName: z.string(),
      })
    )
    .query(
      async ({ input: { orgName, repoName, branchName }, ctx: { db } }) => {
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
      }
    ),
  dump: publicProcedure.query(async ({ ctx: { db } }) => {
    const dump: Record<string, object> = {};
    for (const [tableName, table] of Object.entries(tables)) {
      const res = await db.select().from(table);
      console.log(`Dumping ${res.length} rows from ${tableName}`);
      dump[tableName] = res;
    }
    return dump;
  }),
});

export const createCaller = createCallerFactory(appRouter);

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
