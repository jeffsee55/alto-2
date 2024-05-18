import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "~/services/git/trpc-router";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
    }),
  ],
});
