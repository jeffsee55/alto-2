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
    orgName: text("org_name").notNull(),
    repoName: text("repo_name").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgName, t.repoName] }),
  })
);

export const branches = sqliteTable(
  "branches",
  {
    orgName: text("org_name").notNull(),
    repoName: text("repo_name").notNull(),
    branchName: text("branch_name").notNull(),
    commit: text("commit")
      .notNull()
      .references(() => commits.oid),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgName, t.repoName, t.branchName] }),
    repo: foreignKey({
      columns: [t.orgName, t.repoName],
      foreignColumns: [repos.orgName, repos.repoName],
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
    orgName: text("org_name").notNull(),
    repoName: text("repo_name").notNull(),
    branchName: text("branch_name").notNull(),
    blobOid: text("blob_oid")
      .notNull()
      .references(() => blobs.oid),
    path: text("path").notNull(),
  },
  (table) => {
    return {
      branch: foreignKey({
        columns: [table.orgName, table.repoName, table.branchName],
        foreignColumns: [
          branches.orgName,
          branches.repoName,
          branches.branchName,
        ],
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
        blobsToBranches.orgName,
        blobsToBranches.repoName,
        blobsToBranches.branchName,
      ],
      references: [branches.orgName, branches.repoName, branches.branchName],
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
      fields: [branches.orgName, branches.repoName],
      references: [repos.orgName, repos.repoName],
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
