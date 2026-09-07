import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  webServer: {
    command: "hugo server --source hugo --bind 127.0.0.1 --port 1313 --disableFastRender --renderToMemory",
    url: "http://127.0.0.1:1313/",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:1313",
  },
});
