import React from "react";
import { tables } from "~/services/git/schema";
import { sql } from "drizzle-orm";

const checkDatabaseExists = async () => {
  let exists = true;
  for await (const table of Object.values(tables)) {
    try {
      await window.getAlto().db.run(sql`SELECT * FROM ${table} LIMIT 1`);
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
    const res = await window.getAlto().db.query.repos.findMany({
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
