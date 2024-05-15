import React from "react";
import { SQLocalDrizzle } from "sqlocal/drizzle";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { schema } from "~/services/git/schema";
import { sql } from "drizzle-orm";

// Initialize Drizzle with SQLocal driver
const { driver } = new SQLocalDrizzle("migrations-test.sqlite3");
export const db = drizzle(driver, { schema });

export default function Database() {
  React.useEffect(() => {
    const run = async () => {
      const setup = async () => {
        await db.run(sql`DROP TABLE IF EXISTS blobs`);
        await db.run(sql`DROP TABLE IF EXISTS blobs_to_branches`);
        await db.run(sql`DROP TABLE IF EXISTS branches`);
        await db.run(sql`DROP TABLE IF EXISTS commits`);
        await db.run(sql`DROP TABLE IF EXISTS repos`);
        await db.run(sql`DROP TABLE IF EXISTS __drizzle_migrations`);

        await db.run(sql`CREATE TABLE 'blobs' (
        'oid' text PRIMARY KEY NOT NULL,
        'content' text NOT NULL
      );
      CREATE TABLE 'blobs_to_branches' (
        'org_name' text NOT NULL,
        'repo_name' text NOT NULL,
        'branch_name' text NOT NULL,
        'blob_oid' text NOT NULL,
        'path' text NOT NULL,
        'directory' text NOT NULL,
        FOREIGN KEY ('blob_oid') REFERENCES 'blobs'('oid') ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ('org_name','repo_name','branch_name') REFERENCES 'branches'('org_name','repo_name','branch_name') ON UPDATE no action ON DELETE no action
      );
      CREATE TABLE 'branches' (
        'org_name' text NOT NULL,
        'repo_name' text NOT NULL,
        'branch_name' text NOT NULL,
        'commit_oid' text NOT NULL,
        PRIMARY KEY('branch_name', 'org_name', 'repo_name'),
        FOREIGN KEY ('commit_oid') REFERENCES 'commits'('oid') ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ('org_name','repo_name') REFERENCES 'repos'('org_name','repo_name') ON UPDATE no action ON DELETE no action
      );
      CREATE TABLE 'commits' (
        'oid' text PRIMARY KEY NOT NULL,
        'content' text NOT NULL,
        'tree' text NOT NULL,
        'parent' text
      );
      CREATE TABLE 'repos' (
        'org_name' text NOT NULL,
        'repo_name' text NOT NULL,
        PRIMARY KEY('org_name', 'repo_name')
      );
      `);
      };
      let needsSetup = false;
      try {
        await db.query.repos.findFirst();
      } catch (e) {
        needsSetup = true;
      }
      if (needsSetup) {
        await setup();
      }
      try {
        await db
          .insert(schema.repos)
          .values({ orgName: "jeffsee55", repoName: "drizzle-orm" });
      } catch (e) {}
      const repo = await db.query.repos.findFirst();
      console.log(repo);
    };
    run();
  }, []);

  return <div>Hi From database</div>;
}
