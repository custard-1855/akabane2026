# 特設サイト

スカラベ・ネットワーク研究会の特設サイト。公開先は https://custard-1855.github.io/akabane2026/ 。
方針は `docs/implementation_policy.md` の6章、作業の一覧は `docs/site_todo.md`、用語は `GLOSSARY.md`。

## 動かす

Node 24 以上が要る。`site/` で次を実行し、http://localhost:4321/akabane2026/ を開く。保存すると表示がすぐ変わる。

```sh
npm install
npm run dev
```

## 文言を変える

| 変えたいもの                                   | ファイル(`src/` から)                                |
| ---------------------------------------------- | ---------------------------------------------------- |
| 企画名、見出しの下の添え書き、`<title>`        | `site.config.ts` の `name`、`nameSub`、`titleSuffix` |
| 一文の紹介(検索結果やリンクのプレビューに出る) | `site.config.ts` の `description`                    |
| 日時と場所                                     | `site.config.ts` の `date`、`place`                  |
| トップの企画の紹介、スカラベの解説、展示の概要 | `pages/index.astro`                                  |
| 展示紹介のページ(冒頭の紹介と、展示物ごとの節) | `pages/exhibits/index.astro`                         |
| トップのヒーローの下に出る、形ごとの説明       | `hero/scene.ts` の `showcase()` の `desc`            |

- 節の見出しは `<Section title="…" label="…">` の `title`(日本語)と `label`(英語)で変える
- 企画名と添え書きは OGP 画像にも入っている。変えたら `npm run og` で `public/og.png` を作り直す
- 祭の後に過去形にするときは、`site.config.ts` の `date` と、`pages/index.astro` の企画の紹介を変える(6.1)

## 画像と色

- ロゴは `src/assets/logo.png`。差し替えたら `npm run og` で OGP 画像も作り直す
- 色は `src/styles/tokens.css`。変えたら `apps/dijkstra-delivery/static/tokens.css` にも同時にコピーする(サイトとゲームで色をずらさない)
- ヒーローの色は `src/components/Hero.astro` の `--accent`、`--accent2`

## 確かめて公開する

```sh
npm run check    # 書式、型、ビルド、ビルド結果の検査
npm run format   # 書式で落ちたら、これで直す
```

main 以外のブランチで編集し、PR を出して main にマージする。main の `site/` が変わると、GitHub Actions がチェックとビルドをして GitHub Pages に公開する(`.github/workflows/site.yml`)。
