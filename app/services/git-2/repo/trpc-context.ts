import { Repo } from "../git";
// import { loadDatabase } from "~/services/git-2/database";

// const { db } = loadDatabase();

// /**
//  * Inner function for `createContext` where we create the context.
//  * This is useful for testing when we don't want to mock Next.js' request/response
//  */
// export async function createContextInner() {
//   return { db };
// }

export type Context = {
  repo: Repo;
};
