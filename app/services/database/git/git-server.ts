import { request as isoRequest } from "isomorphic-git/http/node";
import { Git as Server } from "node-git-server";

export const createGitURL = (args: { urlOrPath: string }) => {
  const pathParts = args.urlOrPath.split("/");
  const dir2 = pathParts.slice(0, pathParts.length - 1).join("/");
  const repo = pathParts[pathParts.length - 1];
  const url = `http://localhost:7005/${repo}`;
  const { http } = createGitServer(dir2, url);
  return { repo: args.urlOrPath, url, http };
};

export const createGitServer = (dir: string, repo: string) => {
  const url = `http://localhost:7005/${repo}`;
  const repos = new Server(dir, {
    autoCreate: true,
  });

  const http: { request: typeof isoRequest } = {
    request: async (...args: Parameters<typeof isoRequest>) => {
      const r = repos.listen(0);
      const req = args[0];
      const url = new URL(req.url);
      const address = r.server?.address();
      if (typeof address === "string") {
        throw new Error(`Unexpected server address of type string`);
      }
      url.port = String(address?.port);
      req.url = url.toString();
      const res = await isoRequest(...args);

      await r.close();
      return res;
    },
  };
  return { http, url };
};

export const createGithubURL = () => {};
