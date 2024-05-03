import { relations } from "drizzle-orm";
import {
  sqliteTable,
  text,
  primaryKey,
  foreignKey,
} from "drizzle-orm/sqlite-core";

export const repos = sqliteTable(
  "repos",
  {
    org: text("org").notNull(),
    name: text("name").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.org, t.name] }),
  })
);

export const branches = sqliteTable(
  "branches",
  {
    name: text("id").notNull(),
    commit: text("commit")
      .notNull()
      .references(() => commits.oid),
    repoName: text("repo_name").notNull(),
    org: text("org").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.org, t.repoName, t.name] }),
    repo: foreignKey({
      columns: [t.org, t.repoName],
      foreignColumns: [repos.org, repos.name],
      name: "repo",
    }),
  })
);

export const commits = sqliteTable("commits", {
  oid: text("oid").primaryKey().notNull(),
  content: text("content").notNull(),
  tree: text("tree").notNull(),
});

export const blobs = sqliteTable("blobs", {
  oid: text("oid").primaryKey().notNull(),
  content: text("content").notNull(),
});

export const blobsToBranches = sqliteTable(
  "blobs_to_branches",
  {
    blobOid: text("blob_oid")
      .notNull()
      .references(() => blobs.oid),
    path: text("path").notNull(),
    org: text("org").notNull(),
    repoName: text("repo_name").notNull(),
    branchName: text("branch_name").notNull(),
  },
  (table) => {
    return {
      branch: foreignKey({
        columns: [table.org, table.repoName, table.branchName],
        foreignColumns: [branches.org, branches.repoName, branches.name],
        name: "branch",
      }),
    };
  }
);

const repoRelations = relations(repos, ({ many }) => {
  return {
    branches: many(branches),
  };
});

const blobsToBranchesRelations = relations(blobsToBranches, ({ one }) => {
  return {
    branch: one(branches, {
      fields: [
        blobsToBranches.org,
        blobsToBranches.repoName,
        blobsToBranches.branchName,
      ],
      references: [branches.org, branches.repoName, branches.name],
    }),
    blob: one(blobs, {
      fields: [blobsToBranches.blobOid],
      references: [blobs.oid],
    }),
  };
});

const branchRelations = relations(branches, ({ many, one }) => {
  return {
    commit: one(commits, {
      fields: [branches.commit],
      references: [commits.oid],
    }),
    repo: one(repos, {
      fields: [branches.org, branches.repoName],
      references: [repos.org, repos.name],
    }),
    blobsToBranches: many(blobsToBranches),
  };
});
const blobRelations = relations(branches, ({ many }) => {
  return {
    blobsToBranches: many(blobsToBranches),
  };
});

export const tables = {
  blobsToBranches,
  branches,
  repos,
  commits,
  blobs,
};

export const schema = {
  ...tables,
  repoRelations,
  branchRelations,
  blobsToBranchesRelations,
  blobRelations,
};
