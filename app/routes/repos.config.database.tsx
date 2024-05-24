import React from "react";
import { HeadersFunction } from "@vercel/remix";

export const headers: HeadersFunction = () => ({
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
});

const Database = React.lazy(() => import("~/components/db"));

export default function Page() {
  const [isBrowser, setIsBrowser] = React.useState(false);

  React.useEffect(() => {
    setIsBrowser(true);
  }, []);

  if (!isBrowser) {
    return null;
  }

  return (
    <div className="w-full flex-1 flex">
      <div className="pt-24 pb-12 mx-auto">
        <div className="w-full flex gap-20">
          <div className="inline-flex flex-col gap-3">
            {isBrowser && <Database />}
          </div>
        </div>
      </div>
    </div>
  );
}
