import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { schema } from "./schema";

export type DB =
  | BetterSQLite3Database<typeof schema>
  | LibSQLDatabase<typeof schema>
  | SqliteRemoteDatabase<typeof schema>;

// Current the these types are more verbose than they need to be
// at some scale it might make sense to omit `mode` and `oid`
// since mode can be inferred and oid is likely being changed
// depending on what type of operation is being performed
export type TreeType = {
  type: "tree";
  mode: "040000";
  name: string;
  path: string;
  oid: string;
  entries: Record<string, TreeType | BlobType>;
};
export type BlobType = {
  type: "blob";
  mode: "100644";
  oid: string;
  name: string;
  path: string;
};
