import React from "react";
import { HeadersFunction } from "@vercel/remix";
import {
  ClientActionFunctionArgs,
  ClientLoaderFunctionArgs,
  useLoaderData,
  useParams,
} from "@remix-run/react";
import { z } from "zod";
import { trpc } from "~/components/trpc-client";
import { getBranch } from "~/components/use-branch";

export const headers: HeadersFunction = () => ({
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
});

const Files = React.lazy(() => import("~/components/files"));

export const clientAction = async (args: ClientActionFunctionArgs) => {
  const { "*": path } = z
    .object({
      orgName: z.string(),
      repoName: z.string(),
      branchName: z.string(),
      "*": z.string(),
    })
    .parse(args.params);
  const body = await args.request.formData();
  const branch = await getBranch(args.params);

  const content = body.get("content")?.toString() || "";

  await branch.upsert({
    path,
    content,
  });

  return {};
};

export const clientLoader = async (args: ClientLoaderFunctionArgs) => {
  const { "*": path } = z
    .object({
      orgName: z.string(),
      repoName: z.string(),
      branchName: z.string(),
      "*": z.string(),
    })
    .parse(args.params);
  const branch = await getBranch(args.params);
  const list = await branch.list();
  const item = await branch.find({ path });
  console.log(item);
  return { list, item };
};

export default function Page() {
  const [isBrowser, setIsBrowser] = React.useState(false);
  const clientData = useLoaderData<typeof clientLoader>();
  const params = useParams();
  const { orgName, repoName, branchName } = z
    .object({
      orgName: z.string(),
      repoName: z.string(),
      branchName: z.string(),
      "*": z.string(),
    })
    .parse(params);

  React.useEffect(() => {
    const i = setInterval(async () => {
      const check = await trpc.check.query({
        orgName,
        repoName,
        branchName,
      });
      const branch = await getBranch(params);
      if (check.commitOid === branch.commitOid) {
        // console.log("all good");
      } else {
        const diffs = await branch.changesSince(check.commitOid);

        await trpc.sync.mutate({
          orgName,
          branchName,
          repoName,
          changes: diffs,
        });
      }
    }, 2000);
    return () => clearInterval(i);
  }, [branchName, orgName, repoName]);

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
