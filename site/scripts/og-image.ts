// OGP 画像(public/og.png)を作る。npm run og で動かし、できた画像をコミットする。
// 白地の 1200×630 に、ロゴと企画名、添え書きを並べる。日時は入れない(祭の後も古くならないように)。
// 文字は satori でサイトと同じ IBM Plex Sans JP の輪郭にし、sharp で PNG にする
import { readFileSync } from "node:fs";
import sharp from "sharp";
import satori from "satori";
import { SITE } from "../src/site.config.ts";

const WIDTH = 1200;
const HEIGHT = 630;
const LOGO_HEIGHT = 300;

const root = new URL("../", import.meta.url);
const logo = readFileSync(new URL("src/assets/logo.png", root));
const { width: logoW = 1, height: logoH = 1 } = await sharp(logo).metadata();

// Fontsource は文字の範囲ごとにファイルを分けている。satori は同じ名前のフォントを1つしか使わず、
// woff2 も読めないので、文字を含む woff だけを CSS の unicode-range から選び、別々の名前で渡す
const fontDir = new URL("node_modules/@fontsource/ibm-plex-sans-jp/", root);
type Weight = 400 | 500;
const fonts: { name: string; data: Buffer; weight: Weight }[] = [];

/** text を weight で書くためのフォントを読み込み、style の fontFamily に渡す名前の並びを返す */
function fontFamily(text: string, weight: Weight): string {
  const css = readFileSync(new URL(`${weight}.css`, fontDir), "utf8");
  const names: string[] = [];
  for (const [, file, ranges] of css.matchAll(
    /url\(\.\/(files\/[^)]+\.woff)\)[^;]*;\s*unicode-range: ([^;]+);/g,
  )) {
    const covers = (c: number) =>
      ranges.split(",").some((r) => {
        const [lo, hi = lo] = r.replace("U+", "").split("-");
        return parseInt(lo, 16) <= c && c <= parseInt(hi, 16);
      });
    if (![...text].some((ch) => covers(ch.codePointAt(0)!))) continue;
    fonts.push({ name: file, data: readFileSync(new URL(file, fontDir)), weight });
    names.push(file);
  }
  return names.join(", ");
}
const nameFont = fontFamily(SITE.name, 500);
const nameSubFont = fontFamily(SITE.nameSub, 400);

// 色は tokens.css の --color-bg、--color-text、--color-text-sub
const svg = await satori(
  {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 48,
        background: "#ffffff",
        letterSpacing: "0.06em",
      },
      children: [
        {
          type: "img",
          props: {
            src: `data:image/png;base64,${logo.toString("base64")}`,
            height: LOGO_HEIGHT,
            width: Math.round((LOGO_HEIGHT * logoW) / logoH),
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 16 },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontFamily: nameFont,
                    fontSize: 46,
                    fontWeight: 500,
                    color: "#1b2230",
                  },
                  children: SITE.name,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontFamily: nameSubFont,
                    fontSize: 26,
                    fontWeight: 400,
                    color: "#5b6372",
                  },
                  children: SITE.nameSub,
                },
              },
            ],
          },
        },
      ],
    },
  },
  { width: WIDTH, height: HEIGHT, fonts },
);

await sharp(Buffer.from(svg))
  .flatten({ background: "#ffffff" })
  .png()
  .toFile(new URL("public/og.png", root).pathname);
