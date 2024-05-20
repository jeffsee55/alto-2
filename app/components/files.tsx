import React, { useRef } from "react";
import { SQLocalDrizzle } from "sqlocal/drizzle";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { schema, tables } from "~/services/git/schema";
import { sql } from "drizzle-orm";
import { Tree, NodeRendererProps } from "react-arborist";
import { ChevronDownIcon, DotIcon } from "lucide-react";
import { type TreeType } from "~/services/git/git";
import { Branch, GitExec } from "~/services/git/git2";
import { Link } from "@remix-run/react";
import MonacoEditor from "react-monaco-editor";

// Initialize Drizzle with SQLocal driver
const { driver } = new SQLocalDrizzle("migrations-test.sqlite3");
export const db = drizzle(driver, { schema });

const checkDatabaseExists = async () => {
  let exists = true;
  for await (const table of Object.values(tables)) {
    try {
      await db.run(sql`SELECT * FROM ${table} LIMIT 1`);
    } catch (e) {
      // console.log(e);
      exists = false;
      break;
    }
  }
  return exists;
};

export default function Files(props) {
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
    const res = await db.query.repos.findMany({
      with: {
        branches: { with: { blobsToBranches: { columns: { blobOid: true } } } },
      },
    });
    setRepos(res);
    return res;
  };

  return <>{dbExists ? <Main {...props} /> : null}</>;
}

const Main = (props) => {
  const [data, setData] = React.useState<TreeType[]>([]);
  const [editorWidth, setEditorWidth] = React.useState(0);
  const [currentOid, setCurrentOid] = React.useState(props.blob.oid);
  const [currentContent, setCurrentContent] = React.useState(
    props.blob.content
  );

  React.useEffect(() => {
    const run = async () => {
      const branchRecord = await db.query.branches.findFirst({
        where: (fields, ops) => ops.eq(fields.branchName, "main"),
      });
      if (branchRecord) {
        const commitRecord = await db.query.commits.findFirst({
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

  React.useEffect(() => {
    setEditorWidth(ref2.current?.getBoundingClientRect().width || 0);
  }, [ref2.current]);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="w-full flex divide-x divide-gray-800 flex-1 ">
      <div className="w-72" ref={ref}>
        <Tree
          height={ref.current?.getBoundingClientRect().height}
          initialData={data}
          idAccessor="path"
          childrenAccessor={(d) => {
            if (d?.entries) {
              return Object.values(d?.entries || {});
            }
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
            const hashBlob = async ({ object }) => {
              const encoder = new TextEncoder();
              const data = encoder.encode(value);

              // Use the SubtleCrypto API to hash the data
              const hashBuffer = await crypto.subtle.digest("SHA-256", data);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const hashHex = hashArray
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join("");
              setCurrentOid(hashHex);
              setCurrentContent(value);
            };
            hashBlob({ object: value });
          }}
          value={props.blob.content || ""}
        />
      </div>
      <div className="w-72 p-6">
        <div className="mb-4">
          <div className="px-4 sm:px-0">
            <h3 className="text-base font-semibold leading-7 text-gray-100">
              {props.path}
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-200">
              {currentOid.slice(0, 7)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            console.log(currentContent);
            const gitExec = new GitExec({
              db: db,
              orgName: "jeffsee55",
              repoName: "movie-content",
              dir: "/Users/jeffsee/code/movie-content",
            });
            const branch = Branch.fromRecord({
              db: db,
              orgName: "jeffsee55",
              gitExec,
              branchName: "main",
              repoName: "movie-content",
              commitOid: "",
            });
            await branch.upsert({
              path: "content/crew/crew3.md",
              content: currentContent,
              oid: currentOid,
            });
            // const result = await branch.find({ path: "content/crew/crew3.md" });
            // console.log(result);
          }}
          className="w-full rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Save
        </button>
      </div>
    </div>
  );
};

function Node({
  node,
  style,
  dragHandle,
}: NodeRendererProps<{ id: string; name: string }>) {
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