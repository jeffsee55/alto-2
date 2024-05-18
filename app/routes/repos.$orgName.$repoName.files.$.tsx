import React from "react";
import { HeadersFunction } from "@vercel/remix";
import { useLoaderData } from "@remix-run/react";

export const headers: HeadersFunction = () => ({
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
});

const Files = React.lazy(() => import("~/components/files"));

export const clientLoader = async (p) => {
  const path = p.params["*"];
  const db = await import("../components/repo").then((mod) => mod.db);
  const data = await db.query.blobsToBranches.findFirst({
    where(fields, operators) {
      return operators.eq(fields.path, path);
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
