import { relations } from "drizzle-orm";
import {
  sqliteTable,
  text,
  primaryKey,
  integer,
} from "drizzle-orm/sqlite-core";

export const repos = sqliteTable("repos", {
  id: text("id").primaryKey().notNull(),
});

export const repoRelations = relations(repos, ({ many }) => ({
  files: many(files),
  branches: many(branches),
}));

export const changesets = sqliteTable("changesets", {
  id: integer("id").primaryKey().notNull(),
  branchId: integer("branch_id").notNull(),
  targetId: integer("target_id").notNull(),
  schemaVersion: integer("target_id").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  description: text("title"),
  date: integer("date").notNull(),
});
export const changesetRelations = relations(changesets, ({ one }) => ({
  branch: one(branches, {
    fields: [changesets.branchId],
    references: [branches.id],
  }),
  target: one(branches, {
    fields: [changesets.targetId],
    references: [branches.id],
  }),
}));

export const commits = sqliteTable("commits", {
  id: integer("id").primaryKey().notNull(),
  // isStaging: integer("is_staging").notNull(),
  isSnapshot: integer("is_snapshot").notNull(),
  sha: text("sha"),
});

export const trees = sqliteTable("trees", {
  sha: text("sha").primaryKey().notNull(),
  content: text("content").notNull(),
  commit: text("commit").notNull(),
  shaTree: text("sha_tree").notNull(),
});

export const files = sqliteTable(
  "files",
  {
    repoId: text("repo_id").notNull(),
    name: text("name").notNull(),
    value: text("value").notNull(),
    size: integer("size").notNull(),
    birthtime: integer("birthtime").notNull(),
    base: text("base").notNull(),
    dir: text("dir").notNull(),
    // mtime: integer("mtime").notNull(),
    // ctime: integer("ctime").notNull(),
    // atime: integer("atime").notNull(),
    isDirectory: integer("is_directory").notNull(),
    // isFile: integer("is_file").notNull(),
    // isSymbolicLink: integer("is_symbolic_link").notNull(),
    encoding: text("encoding").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.name] }),
  })
);

export const fileParts = sqliteTable(
  "files_parts",
  {
    repoId: text("repo_id").notNull(),
    name: text("name").notNull(),
    partNumber: integer("part_number").notNull(),
    value: text("value").notNull(),
    size: integer("size").notNull(),
    birthtime: integer("birthtime").notNull(),
    base: text("base").notNull(),
    dir: text("dir").notNull(),
    // mtime: integer("mtime").notNull(),
    // ctime: integer("ctime").notNull(),
    // atime: integer("atime").notNull(),
    isDirectory: integer("is_directory").notNull(),
    // isFile: integer("is_file").notNull(),
    // isSymbolicLink: integer("is_symbolic_link").notNull(),
    encoding: text("encoding").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.name, t.partNumber] }),
  })
);

export const fileRelations = relations(files, ({ one }) => ({
  repo: one(repos, {
    fields: [files.repoId],
    references: [repos.id],
  }),
}));

export const commitRelations = relations(commits, ({ many }) => ({
  entries: many(commitEntries),
  entries2: many(commit2Entries),
  branches: many(branches, { relationName: "commit" }),
  snapshotBranches: many(branches, { relationName: "snapshotCommit" }),
}));

export const commitEntries = sqliteTable(
  "commit_entries",
  {
    commitId: integer("commit_id").notNull(),
    blobSha: text("blob_sha").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.commitId, t.blobSha] }),
  })
);

export const commitsToBlobsRelations = relations(commitEntries, ({ one }) => ({
  commit: one(commits, {
    fields: [commitEntries.commitId],
    references: [commits.id],
  }),
  document: one(documents, {
    fields: [commitEntries.blobSha],
    references: [documents.sha],
  }),
}));

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey().notNull(),
  schemaVersion: integer("schema_version").notNull(),
  name: text("name").notNull(),
  ok: text("ok"),
  dir: text("dir").notNull(),
  collection: text("collection").notNull(),
  json: text("json").notNull(),
  sha: text("sha").notNull(),
  locale: text("locale").notNull(),
  title: text("title"),
  description: text("description"),
  image: text("image"),
  route: text("route"),
});

export const commit2Entries = sqliteTable(
  "commit2_entries",
  {
    commitId: integer("commit_id").notNull(),
    documentId: integer("document_id").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.commitId, t.documentId] }),
  })
);

export const commitsToDocumentRelations = relations(
  commit2Entries,
  ({ one }) => ({
    commit: one(commits, {
      fields: [commit2Entries.commitId],
      references: [commits.id],
    }),
    document: one(documents, {
      fields: [commit2Entries.documentId],
      references: [documents.id],
    }),
  })
);

export const branches = sqliteTable("branches", {
  id: integer("id").primaryKey().notNull(),
  name: text("name").notNull(),
  repoId: text("repo_id").notNull(),
  commitId: integer("commit_id").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  snapshotCommitId: integer("snapshot_commit_id").notNull(),
});

export const branchToCommitsRelations = relations(branches, ({ one }) => ({
  repo: one(repos, {
    fields: [branches.repoId],
    references: [repos.id],
  }),
  commit: one(commits, {
    relationName: "commit",
    fields: [branches.commitId],
    references: [commits.id],
  }),
  snapshotCommit: one(commits, {
    relationName: "snapshotCommit",
    fields: [branches.snapshotCommitId],
    references: [commits.id],
  }),
}));

export const filters = sqliteTable(
  "document_filters",
  {
    leftId: integer("left_id")
      .notNull()
      .references(() => documents.id),
    rightId: text("right_id").notNull(),
    field: text("field").notNull(),
    path: text("path").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.leftId, t.rightId, t.field] }),
  })
);

export const references = sqliteTable(
  "document_references",
  {
    leftId: integer("left_id")
      .notNull()
      .references(() => documents.id),
    rightId: integer("right_id")
      .notNull()
      .references(() => documents.id),
    field: text("field").notNull(),
    path: text("path").notNull(),
    embed: text("embed"),
    as: text("as"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.leftId, t.rightId, t.field] }),
  })
);

export const documentsRelations = relations(documents, ({ many }) => ({
  commits: many(commitEntries),
  commits2: many(commit2Entries),
  references: many(references, {
    relationName: "parent",
  }),
  references2: many(references, {
    relationName: "parent2",
  }),
  references3: many(references, {
    relationName: "parent3",
  }),
  reverseReferences: many(references, {
    relationName: "reverseParent",
  }),
  reverseReferences2: many(references, {
    relationName: "reverseParent2",
  }),
  reverseReferences3: many(references, {
    relationName: "reverseParent3",
  }),
}));

// FIXME: I think documents.id will be documents.name on a lot of these
export const documentsToDocumentsRelations = relations(
  references,
  ({ one }) => ({
    parent: one(documents, {
      fields: [references.leftId],
      relationName: "parent",
      references: [documents.id],
    }),
    child: one(documents, {
      fields: [references.rightId],
      references: [documents.id],
    }),
    parent2: one(documents, {
      fields: [references.leftId],
      relationName: "parent2",
      references: [documents.id],
    }),
    child2: one(documents, {
      fields: [references.rightId],
      references: [documents.id],
    }),
    parent3: one(documents, {
      fields: [references.leftId],
      relationName: "parent3",
      references: [documents.id],
    }),
    child3: one(documents, {
      fields: [references.rightId],
      references: [documents.id],
    }),
    reverseParent: one(documents, {
      fields: [references.rightId],
      relationName: "reverseParent",
      references: [documents.id],
    }),
    reverseChild: one(documents, {
      fields: [references.leftId],
      references: [documents.id],
    }),
    reverseParent2: one(documents, {
      fields: [references.rightId],
      relationName: "reverseParent2",
      references: [documents.id],
    }),
    reverseChild2: one(documents, {
      fields: [references.leftId],
      references: [documents.id],
    }),
    reverseParent3: one(documents, {
      fields: [references.rightId],
      relationName: "reverseParent3",
      references: [documents.id],
    }),
    reverseChild3: one(documents, {
      fields: [references.leftId],
      references: [documents.id],
    }),
  })
);

export const schema = {
  changesets,
  changesetRelations,
  commits,
  commitRelations,
  commitEntries,
  commit2Entries,
  commitsToDocumentRelations,
  commitsToBlobsRelations,
  branches,
  branchToCommitsRelations,
  documents,
  documentsRelations,
  references,
  repos,
  documentsToDocumentsRelations,
  files,
  fileParts,
  filters,
  trees,
};
