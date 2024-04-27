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

export const refs = sqliteTable(
  "refs",
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

export const blobsToRefs = sqliteTable(
  "blobs_to_refs",
  {
    blobOid: text("blob_oid")
      .notNull()
      .references(() => blobs.oid),
    path: text("path").notNull(),
    org: text("org").notNull(),
    repoName: text("repo_name").notNull(),
    refName: text("ref_name").notNull(),
  },
  (table) => {
    return {
      ref: foreignKey({
        columns: [table.org, table.repoName, table.refName],
        foreignColumns: [refs.org, refs.repoName, refs.name],
        name: "ref",
      }),
    };
  }
);

const repoRelations = relations(repos, ({ many }) => {
  return {
    refs: many(refs),
  };
});

const blobsToRefRelations = relations(blobsToRefs, ({ one }) => {
  return {
    ref: one(refs, {
      fields: [blobsToRefs.org, blobsToRefs.repoName, blobsToRefs.refName],
      references: [refs.org, refs.repoName, refs.name],
    }),
    blob: one(blobs, {
      fields: [blobsToRefs.blobOid],
      references: [blobs.oid],
    }),
  };
});

const refRelations = relations(refs, ({ many, one }) => {
  return {
    commit: one(commits, {
      fields: [refs.commit],
      references: [commits.oid],
    }),
    repo: one(repos, {
      fields: [refs.org, refs.repoName],
      references: [repos.org, repos.name],
    }),
    blobsToRefs: many(blobsToRefs, {
      relationName: "blobs",
    }),
  };
});
const blobRelations = relations(refs, ({ many }) => {
  return {
    blobsToRefs: many(blobsToRefs),
  };
});

// export const blobsToRefsRelations = relations(usersToGroups, ({ one }) => ({
//   group: one(groups, {
//     fields: [usersToGroups.groupId],
//     references: [groups.id],
//   }),
//   user: one(users, {
//     fields: [usersToGroups.userId],
//     references: [users.id],
//   }),
// }));

export const tables = {
  blobsToRefs,
  refs,
  repos,
  commits,
  blobs,
};

export const schema = {
  ...tables,
  repoRelations,
  refRelations,
  blobsToRefRelations,
  blobRelations,
};
