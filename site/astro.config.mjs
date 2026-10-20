// @ts-check
import { defineConfig } from "astro/config";

// 公開先の URL は環境変数で切り替える(研究室サイトと同じ)。
//   リポジトリのサイト(https://<user>.github.io/<repo>/) → SITE_BASE=/<repo>/
const site = process.env.SITE_URL ?? "https://custard-1855.github.io";
const base = process.env.SITE_BASE ?? "/akabane2026/";

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
});
