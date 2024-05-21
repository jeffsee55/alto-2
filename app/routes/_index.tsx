import type { MetaFunction, HeadersFunction } from "@remix-run/node";
import { clsx } from "clsx";
import { ChevronRightIcon } from "lucide-react";
import { Repo, movieRepoPath, movieRepoConfig } from "~/services/git/git";
import { Link } from "@remix-run/react";
import { loadDatabase } from "~/services/git/database";
import React from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export const headers: HeadersFunction = () => ({
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
});

export default function Index() {
  return (
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
              <div className="w-64 h-96 rounded-lg bg-[#56514d] flex flex-col overflow-hidden"></div>
              <div className="w-64 h-96 rounded-lg bg-[#453d4c]"></div>
            </div>
          </div>
          <Deployments />
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
        {deployments.map((deployment, i) => (
          <li
            key={i}
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
