import { defineConfig } from "@playwright/test";

// 公開するものと同じビルド結果(dist/)に対してテストする
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173/",
    browserName: "chromium",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  expect: {
    // canvas の絵の比較。描画の細かな揺れは許し、形や色の違いは拾う
    toMatchSnapshot: { threshold: 0.02, maxDiffPixels: 0 },
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173/",
    reuseExistingServer: !process.env.CI,
  },
});
