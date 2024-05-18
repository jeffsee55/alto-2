// import { LinksFunction } from "@remix-run/node";
import { LinksFunction } from "@vercel/remix";
import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import stylesheet from "~/tailwind.css?url";
import {
  BoltIcon,
  DatabaseIcon,
  GitBranchIcon,
  HomeIcon,
  SearchIcon,
} from "lucide-react";
import clsx from "clsx";

{
  /* <link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Raleway:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet"></link> */
}

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Raleway:ital,wght@0,100..900;1,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="h-screen w-screen bg-zinc-900 text-white flex flex-col">
          <div className="h-16 w-full border-b border-zinc-800 flex justify-between items-center">
            <div className="w-20 h-16 flex items-center border-r border-zinc-800">
              <Link
                to="/"
                className="py-2 px-4 font-display text-2xl font-bold"
              >
                Alto
              </Link>
            </div>
            <div className="flex w-96">
              <label htmlFor="search-field" className="sr-only">
                Search
              </label>
              <div className="relative w-full">
                <SearchIcon
                  className="absolute left-2 top-3 h-4 w-4 text-gray-600"
                  aria-hidden="true"
                />
                <input
                  id="search-field"
                  className="flex h-10 w-full rounded-md border border-zinc-800 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-8"
                  placeholder="Search..."
                  type="search"
                  name="search"
                />
              </div>
            </div>
            <div />
          </div>
          <div className="flex flex-1 overflow-scroll">
            <div className="w-20 border-r border-zinc-800 flex flex-col justify-between items-center">
              <div />
              <div>
                <ul className="flex flex-col gap-y-2">
                  <li>
                    <Link
                      to={"/"}
                      className={clsx(
                        // eslint-disable-next-line no-constant-condition
                        false
                          ? "bg-zinc-900 text-white"
                          : "text-gray-400 hover:text-gray-200 hover:bg-zinc-900",
                        "group flex gap-x-3 rounded-md p-3 text-sm leading-6 font-semibold"
                      )}
                    >
                      <HomeIcon className="h-5 w-5" strokeWidth={1.25} />
                      <span className="sr-only">Home</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      to={"#"}
                      className={clsx(
                        // eslint-disable-next-line no-constant-condition
                        false
                          ? "bg-zinc-900 text-white"
                          : "text-gray-400 hover:text-gray-200 hover:bg-zinc-900",
                        "group flex gap-x-3 rounded-md p-3 text-sm leading-6 font-semibold"
                      )}
                    >
                      <GitBranchIcon className="h-5 w-5" strokeWidth={1.25} />
                      <span className="sr-only">Changes</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      to={"#"}
                      className={clsx(
                        // eslint-disable-next-line no-constant-condition
                        false
                          ? "bg-zinc-900 text-white"
                          : "text-gray-400 hover:text-gray-200 hover:bg-zinc-900",
                        "group flex gap-x-3 rounded-md p-3 text-sm leading-6 font-semibold"
                      )}
                    >
                      <BoltIcon className="h-5 w-5" strokeWidth={1.25} />
                      <span className="sr-only">Settings</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      to={"/config/database"}
                      className={clsx(
                        // eslint-disable-next-line no-constant-condition
                        false
                          ? "bg-zinc-900 text-white"
                          : "text-gray-400 hover:text-gray-200 hover:bg-zinc-900",
                        "group flex gap-x-3 rounded-md p-3 text-sm leading-6 font-semibold"
                      )}
                    >
                      <DatabaseIcon className="h-5 w-5" strokeWidth={1.25} />
                      <span className="sr-only">Settings</span>
                    </Link>
                  </li>
                </ul>
              </div>
              <div></div>
            </div>
            {children}
          </div>
        </div>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
