import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema";
import { Repo } from "./git/repo";

export class Database {
  _db: BetterSQLite3Database<typeof schema>;
  _schema = schema;

  git = {
    repo: (dir: string) => {
      return new Repo(this._db, dir);
    },
  };

  constructor(db: BetterSQLite3Database<typeof schema>) {
    this._db = db;
  }

  async reset() {
    await this._db.delete(this._schema.blobs).run();
    await this._db.delete(this._schema.treeEntries).run();
    await this._db.delete(this._schema.repos).run();
    await this._db.delete(this._schema.trees).run();
    await this._db.delete(this._schema.changesets).run();
    await this._db.delete(this._schema.commitEntries).run();
    await this._db.delete(this._schema.commit2Entries).run();
    await this._db.delete(this._schema.commits).run();
    await this._db.delete(this._schema.branches).run();
    await this._db.delete(this._schema.files).run();
    await this._db.delete(this._schema.fileParts).run();
    await this._db.delete(this._schema.filters).run();
    await this._db.delete(this._schema.references).run();
    await this._db.delete(this._schema.refs).run();
    await this._db.delete(this._schema.documents).run();
  }
}
