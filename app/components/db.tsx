import React from "react";
import { tables } from "~/services/git/schema";
import { sql } from "drizzle-orm";
import { trpc } from "./trpc-client";
import clsx from "clsx";
import { Link } from "@remix-run/react";

const checkDatabaseExists = async () => {
  let exists = true;
  for await (const table of Object.values(tables)) {
    try {
      const db = window.getAlto().db;
      await db.run(sql`SELECT * FROM ${table} LIMIT 1`);
    } catch (e) {
      // console.log(e);
      exists = false;
      break;
    }
  }
  return exists;
};

const setup = async () => {
  const db = window.getAlto().db;
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
        'remote_source' text NOT NULL,
        PRIMARY KEY('org_name', 'repo_name')
      );
      `);
};

const importDump = async () => {
  const db = window.getAlto().db;
  const list2 = await trpc.dump.query();
  for await (const table of Object.values(tables)) {
    await db.delete(table).run();
  }

  for await (const [tableName, table] of Object.entries(tables)) {
    await db.delete(table).run();
    const items = list2[tableName];
    for await (const item of items) {
      try {
        await db.insert(table).values(item);
      } catch (e) {
        console.log(`failed`, item);
        console.log(item);
      }
    }
  }
};

export default function Database() {
  const [dbExists, setDbExists] = React.useState(false);
  const [repos, setRepos] = React.useState<
    Awaited<ReturnType<typeof populateRepos>>
  >([]);

  React.useEffect(() => {
    const run = async () => {
      const exists = await checkDatabaseExists();
      if (exists) {
        await populateRepos();
      }
      setDbExists(exists);
    };
    run();
  }, []);

  const populateRepos = async () => {
    const res = await window.getAlto().db.query.repos.findMany({
      with: {
        branches: { with: { blobsToBranches: { columns: { blobOid: true } } } },
      },
    });
    setRepos(res);
    return res;
  };

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          // Drop this into https://sqlite.drizzle.studio/
          const databaseFile = await window.getAlto().getDatabaseFile();
          const fileUrl = URL.createObjectURL(databaseFile);
          console.log(fileUrl);

          const a = document.createElement("a");
          a.href = fileUrl;
          a.download = "database.sqlite3";
          a.click();
          a.remove();

          URL.revokeObjectURL(fileUrl);
        }}
        className="mb-4 rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Download SQLite file
      </button>
      <ul>
        {/* <li>Database check {dbExists ? "Exists" : "Not exists"}</li> */}
        {/* Heading */}
        {dbExists ? null : (
          <div className="sm:rounded-lg bg-gray-700/10 mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-gray-100">
                Database not found
              </h3>
              <div className="mt-2 max-w-xl text-sm text-gray-200">
                <p>
                  The database has not yet been initialized. Click the button
                </p>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={async () => {
                    await setup();
                    await checkDatabaseExists();
                  }}
                  className="inline-flex items-center rounded-md bg-gray-500/10 px-3 py-2 text-sm font-semibold text-gray-100 shadow-sm ring-1 ring-inset ring-gray-700 hover:bg-gray-70"
                >
                  Initialize
                </button>
              </div>
            </div>
          </div>
        )}
        {repos.length === 0 ? (
          <div className="sm:rounded-lg bg-gray-700/10 mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-gray-100">
                No repos found
              </h3>
              <div className="mt-2 max-w-xl text-sm text-gray-200">
                <p>Run the database dump to import all repos from the server</p>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={async () => {
                    // await setup();
                    // await checkDatabaseExists();
                    await importDump();
                    await populateRepos();
                  }}
                  className="inline-flex items-center rounded-md bg-gray-500/10 px-3 py-2 text-sm font-semibold text-gray-100 shadow-sm ring-1 ring-inset ring-gray-700 hover:bg-gray-70"
                >
                  Initialize
                </button>
              </div>
            </div>
          </div>
        ) : (
          repos.map((repo) => {
            let totalBlobs = 0;
            repo.branches.forEach((branch) => {
              totalBlobs += branch.blobsToBranches.length;
            });
            const mainBranch = repo.branches.find(
              (b) => b.branchName === "main"
            );
            const stats = [
              { name: "Branches", value: repo.branches.length },
              { name: "Total blobs", value: totalBlobs },
              {
                name: "Latest commit",
                value: mainBranch?.commitOid.slice(0, 6),
              },
              { name: "Schema", value: "n/a" },
            ];

            return (
              <div key={repo.repoName}>
                <div className="sm:rounded-lg flex flex-col items-start justify-between gap-x-8 gap-y-4 bg-gray-700/10 px-4 py-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
                  <div>
                    <div className="flex items-center gap-x-3">
                      <div className="flex-none rounded-full bg-green-400/10 p-1 text-green-400">
                        <div className="h-2 w-2 rounded-full bg-current" />
                      </div>
                      <h1 className="flex gap-x-3 text-base leading-7">
                        <span className="font-semibold text-white">
                          {repo.orgName}
                        </span>
                        <span className="text-gray-600">/</span>
                        <span className="font-semibold text-white">
                          {repo.repoName}
                        </span>
                      </h1>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-gray-400">
                      Deploys from GitHub via main branch
                    </p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => importDump()}
                      className="block rounded-md bg-gray-700/10 px-2.5 py-1.5 text-sm font-semibold text-gray-200 shadow-sm ring-1 ring-inset ring-gray-600 hover:bg-gray-700"
                    >
                      Reimport
                    </button>
                    <Link
                      to={`/repos/${repo.orgName}/${repo.repoName}`}
                      className="block rounded-md bg-gray-700/10 px-2.5 py-1.5 text-sm font-semibold text-gray-200 shadow-sm ring-1 ring-inset ring-gray-600 hover:bg-gray-700"
                    >
                      Visit
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-1 bg-gray-700/10 sm:grid-cols-2 lg:grid-cols-4">
                  {stats.map((stat, statIdx) => (
                    <div
                      key={stat.name}
                      className={clsx(
                        statIdx % 2 === 1
                          ? "sm:border-l"
                          : statIdx === 2
                          ? "lg:border-l"
                          : "",
                        "border-t border-white/5 py-6 px-4 sm:px-6 lg:px-8"
                      )}
                    >
                      <p className="text-sm font-medium leading-6 text-gray-400">
                        {stat.name}
                      </p>
                      <p className="mt-2 flex items-baseline gap-x-2">
                        <span className="text-4xl font-semibold tracking-tight text-white">
                          {stat.value}
                        </span>
                        {stat.unit ? (
                          <span className="text-sm text-gray-400">
                            {stat.unit}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </ul>
    </div>
  );
}
