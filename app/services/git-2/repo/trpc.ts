import type { TreeType, BlobType, DB } from "../types";

export class TrpcRepo {
  db: DB;
  constructor(args: { db: DB }) {
    this.db = args.db;
  }

  static async clone() {}

  async clone() {
    throw new Error(`Not implemented`);
  }
  async fetch() {
    throw new Error(`Not implemented`);
  }
}
