import type { MetaFunction } from "@remix-run/node";
import { clsx } from "clsx";
import {
  BoltIcon,
  ChevronRightIcon,
  GitBranchIcon,
  HomeIcon,
  SearchIcon,
} from "lucide-react";
import { Repo } from "~/services/git/git";
import { tables } from "~/services/git/schema";
import { Link, useLoaderData } from "@remix-run/react";
import { loadDatabase } from "~/services/git/database";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export async function loader() {
  const movieRepoPath = "/Users/jeffsee/code/movie-content";
  const { db } = loadDatabase();
  // for await (const table of Object.values(tables)) {
  //   await db.delete(table).run();
  // }
  const repo = await Repo.init({
    orgName: "jeffsee55",
    repoName: "movie-content",
    db,
    dir: movieRepoPath,
    branchName: "main",
  });
  const branch = await repo.getBranch({ branchName: "main" });

  const result = await branch.list();
  console.log(result.items);
  return result;
}

export default function Index() {
  const data = useLoaderData<typeof loader>();
  return (
    <div className="h-screen w-screen bg-zinc-900 text-white flex flex-col">
      <div className="h-16 w-full border-b border-zinc-800 flex justify-between items-center">
        <div className="w-20 h-16 flex items-center border-r border-zinc-800">
          <div className="py-2 px-4 font-display text-2xl font-bold">Alto</div>
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
                  to={"#"}
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
            </ul>
          </div>
          <div>F</div>
        </div>
        <div className="w-full flex-1 flex">
          <div className="pt-24 pb-12 mx-auto">
            <div className="text-4xl mb-24">
              <span className="font-display font-light">Good morning, </span>
              <span className="font-display font-black">Alto</span>
            </div>
            <div className="w-full flex gap-20">
              <div className="inline-flex flex-col gap-3">
                <div className="flex w-full justify-between items-center">
                  <div className="text-lg">
                    <span className="font-display font-semibold">
                      Active Changesets
                    </span>
                  </div>
                  <div className="text-sm">
                    <Link to="#" className="font-display font-semibold">
                      View All{" "}
                      <span className="pl-2" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-64 h-96 rounded-lg bg-[#56514d] flex flex-col overflow-hidden">
                    {JSON.stringify(data)}
                  </div>
                  <div className="w-64 h-96 rounded-lg bg-[#453d4c]"></div>
                </div>
              </div>
              <Deployments />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const statuses: Record<string, string> = {
  offline: "text-gray-500 bg-gray-100/10",
  online: "text-green-400 bg-green-400/10",
  error: "text-rose-400 bg-rose-400/10",
};
const environments: Record<string, string> = {
  Preview: "text-gray-400 bg-gray-400/10 ring-gray-400/20",
  Production: "text-indigo-400 bg-indigo-400/10 ring-indigo-400/30",
};
const deployments: Record<string, string | number>[] = [
  {
    id: 1,
    href: "#",
    projectName: "ios-app",
    teamName: "Planetaria",
    status: "offline",
    statusText: "Initiated 1m 32s ago",
    description: "Deploys from GitHub",
    environment: "Preview",
  },
  // More deployments...
  {
    id: 1,
    href: "#",
    projectName: "ios-app",
    teamName: "Planetaria",
    status: "online",
    statusText: "Initiated 1m 32s ago",
    description: "Deploys from GitHub",
    environment: "Production",
  },
];

const Deployments = () => {
  return (
    <main className="w-full">
      <header className="flex items-center justify-between border-b border-white/5 px-4 pb-4 sm:px-6 sm:pb-4 lg:px-8">
        <span className="font-display font-semibold">Recent Releases</span>
      </header>

      <ul className="divide-y divide-white/5">
        {deployments.map((deployment) => (
          <li
            key={deployment.id}
            className="relative flex items-center space-x-4 px-4 py-4 sm:px-6 lg:px-8"
          >
            <div className="min-w-0 flex-auto">
              <div className="flex items-center gap-x-3">
                <div
                  className={clsx(
                    statuses[deployment.status],
                    "flex-none rounded-full p-1"
                  )}
                >
                  <div className="h-2 w-2 rounded-full bg-current" />
                </div>
                <h2 className="min-w-0 text-sm font-semibold leading-6 text-white">
                  <a href={String(deployment.href)} className="flex gap-x-2">
                    <span className="truncate">{deployment.teamName}</span>
                    <span className="text-gray-400">/</span>
                    <span className="whitespace-nowrap">
                      {deployment.projectName}
                    </span>
                    <span className="absolute inset-0" />
                  </a>
                </h2>
              </div>
              <div className="mt-3 flex items-center gap-x-2.5 text-xs leading-5 text-gray-400">
                <p className="truncate">{deployment.description}</p>
                <svg
                  viewBox="0 0 2 2"
                  className="h-0.5 w-0.5 flex-none fill-gray-300"
                >
                  <circle cx={1} cy={1} r={1} />
                </svg>
                <p className="whitespace-nowrap">{deployment.statusText}</p>
              </div>
            </div>
            <div
              className={clsx(
                environments[deployment.environment],
                "rounded-full flex-none py-1 px-2 text-xs font-medium ring-1 ring-inset"
              )}
            >
              {deployment.environment}
            </div>
            <ChevronRightIcon
              className="h-5 w-5 flex-none text-gray-400"
              aria-hidden="true"
            />
          </li>
        ))}
      </ul>
    </main>
  );
};
