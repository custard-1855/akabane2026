# 研究室サイト

公開するのは `index.html`(トップのヒーロー)。`prototypes/` は検討の記録で、ビルドと公開の対象外(凍結)。
経緯は `docs/lab_site_top_concepts.md`。

## 開発

```sh
npm install
npm run dev        # 開発サーバー
npm run build      # dist/ に公開用のファイルを出力
```

## テスト

```sh
npm test                  # 処理のテスト(Vitest、ブラウザ不要)
npm run test:e2e          # ブラウザのテスト(Playwright。ビルドしてから dist/ に対して動かす)
npm run test:e2e:update   # 見た目を意図して変えたとき、ベースライン画像を更新する
```

- `tests/unit/`: 形の生成(頂点数・辺数・次数)と、クリックで実行する処理(幅優先探索・彩色)の正しさ。
  `load-hero.ts` が `index.html` のスクリプトを Node 上で動かし、中の関数を取り出している
- `tests/e2e/visual.spec.ts`: 乱数と時間を固定し、canvas の絵をベースライン画像(`*-snapshots/`)と画素単位で比べる。
  作り直しの前後でこれが通れば、描画は変わっていない
- `tests/e2e/behavior.spec.ts`: 形の切り替え、クリック、テーマ、検証用ボタン、動きを減らす設定、レイアウト
  - 既知の不具合は `test.fail` で記録している(直したら外す)
