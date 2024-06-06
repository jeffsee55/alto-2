import { z } from "zod";
import { initTRPC } from "@trpc/server";
import { Context } from "./trpc-context";

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
  resolveRef: publicProcedure
    .input(
      z.object({
        repoName: z.string(),
        orgName: z.string(),
        branchName: z.string(),
      })
    )
    .query(async ({ input, ctx: { repo } }) => {
      return repo.resolveRef(input);
    }),
  readCommit: publicProcedure
    .input(z.object({ oid: z.string() }))
    .query(async ({ input, ctx: { repo } }) => {
      return repo.readCommit({ oid: input.oid });
    }),
});

export const createCaller = createCallerFactory(appRouter);

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
