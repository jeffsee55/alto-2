import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema";

export class Database {
  _db: BetterSQLite3Database<typeof schema>;
  _schema = schema;

  constructor(db: BetterSQLite3Database<typeof schema>) {
    this._db = db;
  }
}
