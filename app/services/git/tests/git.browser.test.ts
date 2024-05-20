// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { GitBrowser } from "../git.browser";
import { common } from "./common";

describe("shared logic with node", async () => {
  const b = new GitBrowser();
  for await (const [key, value] of Object.entries(common)) {
    it(key, async () => {
      const result = await value(b);
      expect(result.value).toMatchFileSnapshot(result.file);
    });
  }
});
