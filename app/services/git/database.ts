import { dbSetup as sqliteSetup } from "./adapters/sqlite";
import { dbSetup as libsqlSetup } from "./adapters/libsql";

export const loadDatabase = () => {
  const driver = process.env.DRIVER;
  switch (driver) {
    case "sqlite":
      return sqliteSetup();
    case "turso":
      return libsqlSetup();
    default:
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "DRIVER environment variable must be set to either 'sqlite' or 'turso'"
        );
      }
      return libsqlSetup();
  }
};
