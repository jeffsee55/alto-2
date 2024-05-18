import { tables } from "./schema";
import { publicProcedure, router } from "./trpc";
import { loadDatabase } from "./database";

export const appRouter = router({
  dump: publicProcedure.query(async () => {
    const { db } = loadDatabase();
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
