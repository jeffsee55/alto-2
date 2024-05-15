import type { MetaFunction } from "@remix-run/node";
import React from "react";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export default function Database() {
  React.useEffect(() => {
    const run = async () => {
      sqlite3InitModule({
        print: console.log,
        printErr: console.error,
      }).then((sqlite3) => {
        console.log("got it going");
        try {
          console.log("Done initializing. Running demo...");
          start(sqlite3);
        } catch (err) {
          console.log("got it not going");
          if (err instanceof Error) {
            console.error(err.name, err.message);
          }
        }
      });
    };
    run();
  }, []);

  return <div>Hi From database</div>;
}

const start = function (sqlite3) {
  console.log("Running SQLite3 version", sqlite3.version.libVersion);
  const db = new sqlite3.oo1.DB("/mydb.sqlite3", "ct");
  try {
    console.log("Creating a table...");
    db.exec("CREATE TABLE IF NOT EXISTS t(a,b)");
    console.log("Insert some data using exec()...");
    for (let i = 20; i <= 25; ++i) {
      db.exec({
        sql: "INSERT INTO t(a,b) VALUES (?,?)",
        bind: [i, i * 2],
      });
    }
    console.log("Query data with exec()...");
    db.exec({
      sql: "SELECT a FROM t ORDER BY a LIMIT 3",
      callback: (row) => {
        console.log(row);
      },
    });
  } finally {
    db.close();
  }
};
