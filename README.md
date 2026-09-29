# akabane2026

同一LAN内の端末のブラウザから、Mac上の複数のWebアプリを使うための基盤。要件は `docs/requirements.md` を参照。

## 起動

```
uv sync
uv run uvicorn core.main:app --host 0.0.0.0 --port 3000     # 一般向けサーバ
uv run uvicorn core.admin:app --host 127.0.0.1 --port 3001  # 管理サーバ(0.0.0.0 にしない)
```

- 端末からは `http://<MacのIP>:3000/` を開く。
- 監視・アンケート集計は Mac 本体で `http://localhost:3001/` を開く。
- 実行時データ(`storage.db`、`metrics.db`、ログ)は `data/` に作られる。場所は環境変数 `AKABANE_DATA_DIR` で変えられる。

## テスト

```
uv run pytest
node --test apps/dijkstra-delivery/tests/
```

## 構成

| パス | 内容 |
|---|---|
| `core/main.py` | 一般向けサーバ。アプリの読み込み、ランチャー、基盤API |
| `core/admin.py` | 管理サーバ。監視画面、アンケート集計、CSV出力 |
| `core/api.py` | 基盤API(`/api/core/*`) |
| `core/apps.py` | `apps/` の読み込み |
| `core/metrics.py` | リクエスト記録のミドルウェア |
| `core/static/sdk.js` | クライアントSDK(`globalThis.core`) |
| `apps/<app>/` | 各アプリ |

## アプリの追加

`apps/<app>/` に次を置き、サーバを再起動する。規約は要件 5章。

| ファイル | 必須 | 内容 |
|---|---|---|
| `static/index.html` | ○ | `<script src="/core/sdk.js" defer></script>` を読み込む |
| `app.json` | | `{"name": "表示名", "description": "説明"}` |
| `server.py` | | `router = APIRouter()` を公開する。`/api/<app>/` 配下に載る |
| `survey.json` | | アンケート定義。形式は `apps/sample-primes/survey.json` を参照 |

### sdk.js

| API | 内容 |
|---|---|
| `core.api(path, {method, body, timeout})` | `X-Device-Id` 付きの fetch。失敗は `CoreError`(`kind`: `timeout` / `network` / `http`) |
| `core.storage.get(key)` / `set(key, value)` / `remove(key)` | このアプリ・この端末の保存データ。値がなければ `get` は `null` |
| `core.finish()` | 利用を終える。アンケートがあれば表示し、ランチャーへ戻る |
| `core.session` | 今回の利用(`id`, `startedAt`) |
| `core.deviceId()` / `core.setDeviceName(name)` | 端末ID、監視画面に出す端末名 |
