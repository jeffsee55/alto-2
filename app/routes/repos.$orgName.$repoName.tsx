import React from "react";
import { HeadersFunction } from "@vercel/remix";
import { Outlet } from "@remix-run/react";

export const headers: HeadersFunction = () => ({
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
});

const Database = React.lazy(() => import("~/components/repo"));

export default function Page() {
  const [isBrowser, setIsBrowser] = React.useState(false);

  React.useEffect(() => {
    setIsBrowser(true);
  }, []);

  if (!isBrowser) {
    return null;
  }

  return <Outlet />;
}
