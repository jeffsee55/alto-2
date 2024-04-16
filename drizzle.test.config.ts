import type { Config } from "drizzle-kit";
import config from "./drizzle.dev.config";

export default {
  ...config,
  out: "./drizzle.test",
  dbCredentials: {
    url: "test.sqlite",
  },
} satisfies Config;
