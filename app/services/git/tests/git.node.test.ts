import { describe, expect, it } from "vitest";
import { GitServer } from "../git.node";
import { common } from "./common";

describe("shared logic with browser", async () => {
  const b = new GitServer();
  for await (const [key, value] of Object.entries(common)) {
    it(key, async () => {
      const result = await value(b);
      expect(result.value).toMatchFileSnapshot(result.file);
    });
  }
});
