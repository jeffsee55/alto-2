import { HeadersFunction } from "@vercel/remix";
import { Outlet } from "@remix-run/react";
import { useDB } from "~/components/use-db";

export const headers: HeadersFunction = () => ({
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
});

export default function Page() {
  const db = useDB();

  if (!db) {
    return null;
  }

  return <Outlet />;
}
