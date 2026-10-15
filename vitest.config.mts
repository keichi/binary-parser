import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/*.ts"],
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "browser",
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
