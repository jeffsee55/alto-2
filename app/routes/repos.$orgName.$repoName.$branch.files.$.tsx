import React from "react";
import { HeadersFunction } from "@vercel/remix";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import {
  ClientActionFunctionArgs,
  ClientLoaderFunctionArgs,
  useLoaderData,
} from "@remix-run/react";
import { schema } from "~/services/git/schema";
import { z } from "zod";
import { Branch, GitExec } from "~/services/git/git";
import { GitBrowser } from "~/services/git/git.browser";
import { SQLocalDrizzle } from "sqlocal/drizzle";

export const headers: HeadersFunction = () => ({
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
});

const Files = React.lazy(() => import("~/components/files"));

export const clientAction = async (args: ClientActionFunctionArgs) => {
  const {
    orgName,
    repoName,
    branch: branchName,
    "*": path,
  } = z
    .object({
      orgName: z.string(),
      repoName: z.string(),
      branch: z.string(),
      "*": z.string(),
    })
    .parse(args.params);
  const body = await args.request.formData();
  const { driver } = new SQLocalDrizzle("migrations-test.sqlite3");
  const db = drizzle(driver, { schema });
  const gitExec = new GitExec({
    db: db,
    orgName,
    repoName,
    exec: new GitBrowser(),
    remoteSource: "/Users/jeffsee/code/movie-content",
  });
  const branch = Branch.fromRecord({
    db: db,
    orgName,
    gitExec,
    branchName,
    repoName,
    commitOid: "",
  });

  const content = body.get("content")?.toString() || "";
  console.log({ path, content });

  await branch.upsert({
    path,
    content,
  });

  return {};
};

export const clientLoader = async (args: ClientLoaderFunctionArgs) => {
  const {
    orgName,
    repoName,
    branch,
    "*": path,
  } = z
    .object({
      orgName: z.string(),
      repoName: z.string(),
      branch: z.string(),
      "*": z.string(),
    })
    .parse(args.params);
  const db = await import("../components/repo").then((mod) => mod.db);
  const data = await db.query.blobsToBranches.findFirst({
    where(fields, ops) {
      return ops.and(
        ops.eq(fields.orgName, orgName),
        ops.eq(fields.repoName, repoName),
        ops.eq(fields.branchName, branch),
        ops.eq(fields.path, path)
      );
    },
    with: {
      blob: true,
    },
  });
  if (data) {
    return data;
  } else {
    return { blob: { oid: "", content: "noncontent" } };
  }
};

export default function Page() {
  const [isBrowser, setIsBrowser] = React.useState(false);
  const clientData = useLoaderData();

  React.useEffect(() => {
    setIsBrowser(true);
  }, []);

  if (!isBrowser) {
    return null;
  }

  return (
    <div className="w-full flex-1 flex hi">
      {isBrowser && <Files {...clientData} />}
    </div>
  );
}
