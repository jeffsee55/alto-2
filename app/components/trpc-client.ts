import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type {
  AppRouter,
  createCaller,
} from "~/services/git-2/repo/trpc-router";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
    }),
  ],
});

export const real: ReturnType<typeof createCaller> = {
  resolveRef: trpc.resolveRef.query,
};
