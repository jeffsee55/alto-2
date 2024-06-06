import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter, createCaller } from "./trpc-router";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
    }),
  ],
});

// Not sure why but the implementation of createCaller
// and the http one have different signatures
// Trying to keep them in sync
export const httpClient: ReturnType<typeof createCaller> = {
  resolveRef: trpc.resolveRef.query,
};
