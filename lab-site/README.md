# 研究室サイト

公開するのは `index.html`(トップのヒーロー)。`prototypes/` は検討の記録で、ビルドと公開の対象外(凍結)。
経緯は `docs/lab_site_top_concepts.md`、実装方針は `docs/implementation_policy.md`。

## 構成

```
index.html        マークアップだけ。スクリプトとスタイルは src/ から読む
src/
  main.ts         起動と、DOM・入力・時間の接続
  scene.ts        回転するグラフと信号の状態、時間を進める(描き方と DOM は知らない)
  render.ts       canvas への描画
  algorithms.ts   クリックで実行する処理(幅優先探索・彩色)。出来事の列を返すだけ
  graphs.ts       有名なグラフの形(C60・トーラス・超立方体・ジオデシック球)
  palette.ts      色(CSS の変数から読む)と色番号
  theme.ts        テーマの切り替えボタン
  dev-panel.ts    検証用の図形切り替え(開発サーバーか ?dev のときだけ出す)
  config.ts       動きの調整値
  math.ts, color.ts, style.css
```

依存は上から下への一方向で、`algorithms.ts` と `graphs.ts` は DOM なしで動く(処理のテストはこれを Node で直接読む)。

## 開発

```sh
npm install
npm run dev        # 開発サーバー(検証用の図形切り替えも出る)
npm run build      # dist/ に公開用のファイルを出力
npm run check      # 整形・ESLint・型チェック・処理のテストをまとめて確認
npm run format     # Prettier で整形する
```

## テスト

```sh
npm test                  # 処理のテスト(Vitest、ブラウザ不要)
npm run test:e2e          # ブラウザのテスト(Playwright。ビルドしてから dist/ に対して動かす)
npm run test:e2e:update   # 見た目を意図して変えたとき、ベースライン画像を更新する
```

- `tests/unit/`: 形の生成(頂点数・辺数・次数)と、クリックで実行する処理(幅優先探索・彩色)の正しさ
- `tests/e2e/visual.spec.ts`: 乱数と時間を固定し、canvas の絵をベースライン画像(`*-snapshots/`)と画素単位で比べる。
  作り直しの前後でこれが通れば、描画は変わっていない
- `tests/e2e/behavior.spec.ts`: 形の切り替え、クリック、テーマ、検証用ボタン、動きを減らす設定、レイアウト
  - 既知の不具合は `test.fail` で記録している(直したら外す)

## 公開(GitHub Pages)

`.github/workflows/lab-site.yml` が、push のたびに `npm run check` とブラウザのテストを実行する。
`main` への push で通れば `dist/` を GitHub Pages に公開する。

初回だけ、リポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」にする。
