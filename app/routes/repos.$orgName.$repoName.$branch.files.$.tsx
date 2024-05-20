import React from "react";
import { HeadersFunction } from "@vercel/remix";
import {
  ClientActionFunctionArgs,
  ClientLoaderFunctionArgs,
  redirect,
  useLoaderData,
} from "@remix-run/react";
import { z } from "zod";

export const headers: HeadersFunction = () => ({
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
});

const Files = React.lazy(() => import("~/components/files"));

export const clientAction = async (args: ClientActionFunctionArgs) => {
  // const url = new URL(args.request.url);
  // console.log(url);
  // return redirect(url.pathname);
  console.log("got action...");
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
  console.log("i ran...", orgName, repoName, branch, path);
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
