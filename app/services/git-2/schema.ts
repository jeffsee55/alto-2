import { relations } from "drizzle-orm";
import {
  sqliteTable,
  text,
  primaryKey,
  int,
  foreignKey,
} from "drizzle-orm/sqlite-core";

export const repos = sqliteTable(
  "repos",
  {
    orgName: text("org_name").notNull(),
    repoName: text("repo_name").notNull(),
    remoteUrl: text("remote_source").notNull(),
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
    commitOid: text("commit_oid")
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
  message: text("message").notNull(),
  tree: text("tree").notNull(),
  treeOid: text("tree_oid").notNull(),
  parent: text("parent"),
  secondParent: text("second_parent"),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email").notNull(),
  timestamp: int("timestamp").notNull(),
  timezoneOffset: int("timezone_offset").notNull(),
});

export const commitRelations = relations(commits, ({ one }) => ({
  parent: one(commits, {
    fields: [commits.parent],
    references: [commits.oid],
  }),
}));

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
    directory: text("directory").notNull(),
  },
  (table) => {
    return {
      // pk: primaryKey({
      //   columns: [
      //     table.orgName,
      //     table.repoName,
      //     table.branchName,
      //     table.blobOid,
      //     table.branchName,
      //   ],
      // }),
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
    commitOid: one(commits, {
      fields: [branches.commitOid],
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
  commitRelations,
  branchRelations,
  blobsToBranchesRelations,
  blobRelations,
};
