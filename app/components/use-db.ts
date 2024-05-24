import React from "react";
import { SQLocalDrizzle } from "sqlocal/drizzle";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { schema } from "~/services/git/schema";

export const getAlto = () => {
  if (!window.altoLocalSqlite) {
    console.log("Creating new SQLocalDrizzle");
    const altoLocalSqlite = new SQLocalDrizzle("migrations-test.sqlite3");
    window.altoLocalSqlite = altoLocalSqlite;
  }
  const db = drizzle(window.altoLocalSqlite.driver, { schema });

  return {
    db,
    getDatabaseFile: window.altoLocalSqlite.getDatabaseFile,
    createCallbackFunction: window.altoLocalSqlite.createCallbackFunction,
  };
};

if (typeof window !== "undefined") {
  window.getAlto = getAlto;
}

declare global {
  interface Window {
    getAlto: typeof getAlto;
    altoLocalSqlite: SQLocalDrizzle;
  }
}

export const useDB = () => {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    setReady(true);
  }, []);

  if (ready) {
    return window.getAlto();
  }
  return undefined;
};
