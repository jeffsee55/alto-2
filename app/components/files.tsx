import React, { useRef } from "react";
import { tables } from "~/services/git/schema";
import { sql } from "drizzle-orm";
import { Tree, NodeRendererProps } from "react-arborist";
import { ChevronDownIcon, DotIcon } from "lucide-react";
import type { BlobType, TreeType } from "~/services/git/types";
import { Form, Link, useNavigate, useParams } from "@remix-run/react";
import MonacoEditor from "react-monaco-editor";
import { Branch } from "~/services/git/git";
import { trpc } from "~/components/trpc-client";
import { getBranch } from "./use-branch";
import { useBranchParams } from "./use-params";

type LoaderData = {
  item: Awaited<ReturnType<Branch["find"]>>;
  list: Awaited<ReturnType<Branch["list"]>>;
};

const checkDatabaseExists = async () => {
  let exists = true;
  for await (const table of Object.values(tables)) {
    try {
      await window.getAlto().db.run(sql`SELECT * FROM ${table} LIMIT 1`);
    } catch (e) {
      exists = false;
      break;
    }
  }
  return exists;
};

export default function Files(props: LoaderData) {
  const [dbExists, setDbExists] = React.useState(false);
  const [, setRepos] = React.useState<
    Awaited<ReturnType<typeof populateRepos>>
  >([]);

  React.useEffect(() => {
    const run = async () => {
      const exists = await checkDatabaseExists();
      if (exists) {
        await populateRepos();
      }
      setDbExists(exists);
    };
    run();
  }, []);

  const populateRepos = async () => {
    const res = await window.getAlto().db.query.repos.findMany({
      with: {
        branches: { with: { blobsToBranches: { columns: { blobOid: true } } } },
      },
    });
    setRepos(res);
    return res;
  };

  return <>{dbExists ? <Main {...props} /> : null}</>;
}

const Main = (props: LoaderData) => {
  const [data, setData] = React.useState<TreeType[]>([]);
  const params = useBranchParams();
  const [editorWidth, setEditorWidth] = React.useState(0);
  const [currentContent, setCurrentContent] = React.useState(
    props.item?.item.blob.content
  );

  React.useEffect(() => {
    setCurrentContent(props.item?.item.blob.content);
  }, [props.item?.item.blob.content]);

  React.useEffect(() => {
    const run = async () => {
      const branchRecord = await window.getAlto().db.query.branches.findFirst({
        where: (fields, ops) => ops.eq(fields.branchName, "main"),
      });
      if (branchRecord) {
        const commitRecord = await window.getAlto().db.query.commits.findFirst({
          where: (fields, ops) => ops.eq(fields.oid, branchRecord.commitOid),
        });
        if (commitRecord) {
          const tree = JSON.parse(commitRecord.tree);
          setData(Object.values(tree.entries));
        }
      }
    };
    run();
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  const ref2 = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const width = ref2.current?.getBoundingClientRect().width;

  React.useEffect(() => {
    setEditorWidth((current) => {
      if (current === 0) {
        return ref2.current?.getBoundingClientRect().width || 0;
      }
      return current;
    });
  }, [setEditorWidth, width]);

  React.useEffect(() => {
    const i = setInterval(async () => {
      const branchRecord = await window.getAlto().db.query.branches.findFirst({
        where: (fields, ops) => ops.eq(fields.branchName, "main"),
      });
      const branch = await getBranch(params);
      const currentCommit = await branch.currentCommit();
      await branch.findMergeBaseCallback(async (commit) => {
        const result = await trpc.commitCallback.query({
          ...params,
          commit: { oid: commit.oid },
        });
        if (result) {
          if (result.currentCommit === currentCommit.oid) {
            console.log(
              "all caught up",
              currentCommit.content,
              currentCommit.oid
            );
            // all caught up
          } else {
            await branch.syncChanges({
              direction: "ahead",
              changes: result.changes,
            });
            // Reload to trigger data fetch. In reality
            // if there's an update on the document we're editing
            // will either need a way to automerge it or prompt the user
            // to resolve the conflict
            navigate(`./${params["*"]}`, { replace: true });
          }
          return true;
        }
        return false;
      });
    }, 500);
    return () => clearInterval(i);
  }, []);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="w-full flex divide-x divide-gray-800 flex-1 ">
      <div className="w-40" ref={ref}>
        <Tree<TreeType | BlobType>
          height={ref.current?.getBoundingClientRect().height}
          initialData={data}
          idAccessor="path"
          childrenAccessor={(d) => {
            if (d.type === "tree") {
              return Object.values(d?.entries || {});
            }
            return null;
          }}
        >
          {Node}
        </Tree>
      </div>
      <div className="flex-1 w-full bg-transparent" ref={ref2}>
        <MonacoEditor
          width={editorWidth}
          height={ref2.current?.getBoundingClientRect().height}
          language="json"
          theme="vs-dark"
          onChange={(value) => {
            setCurrentContent(value);
          }}
          value={currentContent}
        />
      </div>
      <div className="w-72 p-6">
        <div className="mb-2  flex items-center gap-x-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <p className="text-xs leading-5 text-gray-500">
            Up to date with server
          </p>
        </div>
        <div className="">
          <h2 className="text-lg font-semibold leading-6 text-gray-100">
            {props.list.branchName}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-200">
            {props.list.commitOid.slice(0, 7)}
          </p>
        </div>
        <Form method="post" action={window.location.pathname}>
          <div className="mb-4">
            <div className="px-4 sm:px-0">
              <h3 className="text-base font-semibold leading-7 text-gray-100">
                {props.item?.item.path}
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-200">
                {props.item?.item.blob.oid.slice(0, 7)}
              </p>
            </div>
          </div>
          <input
            type="hidden"
            value={currentContent || ""}
            key={params["*"]}
            name="content"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Save
          </button>
          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-red-600/10 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Delete
          </button>
        </Form>
      </div>
    </div>
  );
};

function Node({
  node,
  style,
  dragHandle,
}: NodeRendererProps<TreeType | BlobType>) {
  return node.isLeaf ? (
    <div style={style} ref={dragHandle} className="flex gap-1 items-center">
      <Link to={node.data.path} className="flex gap-2 items-cneter">
        <DotIcon />
        {node.data.name}
      </Link>
    </div>
  ) : (
    <div style={style} ref={dragHandle} className="flex gap-1 items-center">
      <button
        onClick={() => (node.isOpen ? node.close() : node.open())}
        type="button"
        className="flex gap-2 items-cneter"
      >
        <ChevronDownIcon className="h-3 w-3" />
        {node.data.name}
      </button>
    </div>
  );
}
