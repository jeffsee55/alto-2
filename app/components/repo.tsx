import React from "react";
import { SQLocalDrizzle } from "sqlocal/drizzle";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { schema, tables } from "~/services/git/schema";
import { sql } from "drizzle-orm";

// Initialize Drizzle with SQLocal driver
const { driver } = new SQLocalDrizzle("migrations-test.sqlite3");
export const db = drizzle(driver, { schema });

const checkDatabaseExists = async () => {
  let exists = true;
  for await (const table of Object.values(tables)) {
    try {
      await db.run(sql`SELECT * FROM ${table} LIMIT 1`);
    } catch (e) {
      // console.log(e);
      exists = false;
      break;
    }
  }
  return exists;
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
    const res = await db.query.repos.findMany({
      with: {
        branches: { with: { blobsToBranches: { columns: { blobOid: true } } } },
      },
    });
    console.log(res);
    setRepos(res);
    return res;
  };

  return <div>{dbExists ? <div>Doit</div> : null}</div>;
}
