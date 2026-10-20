// ビルド結果(dist/)の検査。npm test がビルドしてから動かす。
// base はビルドと同じ SITE_BASE を使う
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const dist = new URL("../dist/", import.meta.url);
// astro.config.mjs の既定値と揃える
const base = process.env.SITE_BASE ?? "/akabane2026/";
const site = process.env.SITE_URL ?? "https://custard-1855.github.io";
const read = (file: string) => readFileSync(new URL(file, dist), "utf8");
const pages = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter((f) =>
  f.endsWith(".html"),
);

test("トップの <title> は「スカラベ・ネットワーク研究会|川原研 赤羽台祭2026」", () => {
  const html = read("index.html");
  assert.ok(html.includes("<title>スカラベ・ネットワーク研究会|川原研 赤羽台祭2026</title>"));
});

test("どのページのヘッダーにも、企画名と「川原研究室|赤羽台祭2026」がある", () => {
  for (const page of pages) {
    const header = read(page).match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    assert.ok(header.includes(">スカラベ・ネットワーク研究会<"), page);
    assert.ok(header.includes(">川原研究室|赤羽台祭2026<"), page);
  }
});

test("サイト内のリンクと読み込みは、すべて base 付きで、ビルド結果にあるファイルを指す", () => {
  for (const page of pages) {
    const html = read(page);
    for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      const at = `${page} の ${url}`;
      assert.ok(url.startsWith(base), `${at} に base が付いていない`);
      const path = decodeURI(url.slice(base.length).replace(/[?#].*$/, ""));
      const file = path === "" || path.endsWith("/") ? path + "index.html" : path;
      assert.ok(existsSync(new URL(file, dist)), `${at} の先がない`);
    }
  }
});

test("どのページにも OGP のタイトルと画像があり、画像は公開先の URL でビルド結果のファイルを指す", () => {
  for (const page of pages) {
    const html = read(page);
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
    assert.ok(html.includes(`<meta property="og:title" content="${title}">`), page);
    const image = html.match(/<meta property="og:image" content="([^"]*)">/)?.[1] ?? "";
    assert.ok(image.startsWith(site + base), `${page} の og:image ${image}`);
    assert.ok(
      existsSync(new URL(image.slice((site + base).length), dist)),
      `${page} の og:image の先がない`,
    );
  }
});
