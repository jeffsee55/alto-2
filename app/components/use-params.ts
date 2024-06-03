import { useParams } from "@remix-run/react";
import { z } from "zod";

export const useBranchParams = () => {
  const params = useParams();

  return z
    .object({
      orgName: z.string(),
      repoName: z.string(),
      branchName: z.string(),
      "*": z.string(),
    })
    .parse(params);
};
