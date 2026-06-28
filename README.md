# HTTP Operated Browser (HOB)

> **初めての方は [GETTING_STARTED.md](GETTING_STARTED.md) をご覧ください。**

Neutralinojs ベースの軽量ブラウザ。HTTP API 経由で外部の AI エージェントやスクリプトが iframe 内で任意の JavaScript を実行でき、コンソール出力をファイルにキャプチャします。

## Architecture

```
┌─────────────────────────────────────────┐
│  Neutralinojs App (WebView)             │
│  ┌─────────────────────────────────┐    │
│  │  index.html (Browser Chrome)    │    │
│  │  ├─ toolbar (back/fwd/reload)   │    │
│  │  ├─ address bar                 │    │
│  │  └─ iframe (target page)        │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  main.js                        │    │
│  │  ├─ navigate()                  │    │
│  │  ├─ history stack               │    │
│  │  ├─ console hook                │    │
│  │  ├─ exec polling (.tmp/exec.json)│   │
│  │  ├─ nav polling (.tmp/nav.json) │   │
│  │  ├─ dom polling (.tmp/dom_req.json)│ │
│  │  └─ status write (.tmp/status.json)│ │
│  └─────────────────────────────────┘    │
└──────────────┬──────────────────────────┘
               │ Neutralino Extensions
┌──────────────▼──────────────────────────┐
│  ext_server.js (Node.js, port 8080)     │
│  ├─ POST /exec   → .tmp/exec.json       │
│  ├─ POST /navigate → .tmp/nav.json      │
│  ├─ GET  /proxy  → fetch + inject       │
│  ├─ GET  /log    → browser_console.log  │
│  ├─ GET  /status → .tmp/status.json     │
│  ├─ GET  /dom    → .tmp/dom_req/resp    │
│  └─ POST /log    → browser_console.log  │
└─────────────────────────────────────────┘
```

## API Endpoints

### `POST /exec`

iframe 内で任意の JavaScript を実行します。

```bash
curl -X POST http://localhost:8080/exec \
  -H "Content-Type: application/json" \
  -d '{"code": "document.title"}'
```

動作:
1. ext_server.js が `.tmp/exec.json` にコードを書き込む
2. main.js が 500ms 間隔でポーリングし、`iframe.contentWindow.eval()` で実行
3. 実行結果とエラーは `browser_console.log` に記録される
4. `.tmp/exec.json` は実行後に `{}` にクリアされる

レスポンス: `{"status": "queued"}`

### `POST /navigate`

ブラウザ画面の iframe を指定した URL に遷移させます。

```bash
curl -X POST http://localhost:8080/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

動作:
1. ext_server.js が `.tmp/nav.json` に URL を書き込む
2. main.js が 500ms 間隔でポーリングし、`navigate(url)` を呼び出す
3. アドレスバーが更新され、履歴スタックに追加される
4. `.tmp/nav.json` は実行後に `{}` にクリアされる

レスポンス: `{"status": "navigating"}`

### `GET /proxy`

指定 URL のコンテンツをプロキシ経由で取得します。iframe 内表示用。

```bash
curl -s "http://localhost:8080/proxy?url=https://example.com"
```

プロキシの動作:
- `X-Frame-Options` / `Content-Security-Policy` を削除（iframe 埋め込みを許可）
- HTML に `<base>` タグを注入（相対パスの解決）
- HTML に HOB ブリッジスクリプトを注入（`</body>` 直前に挿入）
- 15 秒のタイムアウト
- 非 HTML リソース（画像など）はそのままストリーム転送

### `GET /log`

`browser_console.log` の全内容を取得します。

```bash
curl -s "http://localhost:8080/log"
```

レスポンス: `text/plain` (ログファイルの内容)

### `GET /status`

現在ブラウザが表示している URL を取得します。

```bash
curl -s "http://localhost:8080/status"
```

レスポンス例: `{"url":"https://example.com","timestamp":"2026-06-28T12:00:00.000Z"}`

### `GET /dom`

現在 iframe に表示されているページの HTML（`document.documentElement.outerHTML`）を取得します。

```bash
curl -s "http://localhost:8080/dom" | head -30
```

動作:
1. サーバーが `.tmp/dom_req.json` に DOM 要求を書き込む
2. `main.js` がポーリングし、`postMessage` 経由で iframe にコードを送信
3. 注入スクリプトが `document.documentElement.outerHTML` を `eval()` で実行
4. 結果が `postMessage` 経由で返り、`.tmp/dom_resp.{id}.json` に書き込まれる
5. サーバーが 6 秒間（60回×100ms）ポーリングして結果を返す

レスポンス: `text/html; charset=utf-8`（ページの完全な DOM）

### `POST /log`

`browser_console.log` に行を追記します。

```bash
curl -X POST http://localhost:8080/log \
  -H "Content-Type: application/json" \
  -d '{"text": "custom log entry"}'
```

## Injected Bridge Script

プロキシ経由の HTML ページに自動注入されるスクリプトの機能:

| 機能 | 説明 |
|---|---|
| `console.log` / `console.error` フック | 出力を `window.parent.postMessage` で親フレームに中継 |
| `__hob_exec__` メッセージリスナー | `eval()` でコードを実行し、結果を `postMessage` で返却 |
| `__hob_url__` 通知 | ページロード時に現在の URL を親フレームに通知 |

## File-based IPC

Neutralino の WebSocket イベント (`Neutralino.events.on`) がフロントエンドに届かない問題を回避するため、拡張機能とフロントエンドの通信はファイルベースで行います。

| ファイル | 用途 | 書き込み元 | 読み取り元 |
|---|---|---|---|
| `.tmp/exec.json` | JavaScript コード実行 | ext_server.js (POST /exec) | main.js (polling) |
| `.tmp/nav.json` | ページ遷移 | ext_server.js (POST /navigate) | main.js (polling) |
| `.tmp/status.json` | 現在のURL状態 | main.js (navigate/restore時) | ext_server.js (GET /status) |
| `.tmp/port.json` | サーバポート番号 | ext_server.js (起動時) | main.js (起動時に自動読込) |
| `.tmp/dom_req.json` | DOM取得要求 | ext_server.js (GET /dom) | main.js (polling) |
| `.tmp/dom_resp.{id}.json` | DOM取得結果 | main.js (結果受信時) | ext_server.js (GET /dom) |

## Log Output

`browser_console.log` に記録される内容:

- **Session start**: `--- HOB Session Started: <timestamp> ---`
- **Console.log**: `[HH:MM:SS] [LOG] <message>`
- **Console.error**: `[HH:MM:SS] [ERROR] <message>`
- **Exec result**: `[EXEC] OK: <result>` / `[EXEC] Error: <message>`

書き込みは `Neutralino.filesystem.readFile` + `writeFile` による read-append-write パターン（`appendFile` が `NE_SR_UNBPARS` エラーを起こすため）。

## Browser UI Controls

| 要素 | 動作 |
|---|---|
| ◀ (Back) | 履歴を戻る |
| ▶ (Forward) | 履歴を進む |
| ⟳ (Reload) | iframe をリロード |
| アドレスバー | URL 入力して Enter → `hob:home` でホームページ |
| ホームページ | `default.html`（HTTP API の説明ページ） |

## Typical AI Workflow

AI エージェントが HTTP API のみでブラウザを操作する典型的なフロー:

```bash
# 1. ページに移動
curl -X POST http://localhost:8080/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# 2. 現在のURLを確認（ナビゲーション完了待ち）
sleep 1
curl -s http://localhost:8080/status

# 3. JavaScript を実行
curl -X POST http://localhost:8080/exec \
  -H "Content-Type: application/json" \
  -d '{"code": "document.title"}'

# 4. 実行結果をログから取得
sleep 1
curl -s http://localhost:8080/log | tail -5

# 5. ページのDOMを取得
curl -s http://localhost:8080/dom | head -20
```

全操作が curl だけで完結し、ブラウザの GUI を直接操作する必要はありません。

## Prerequisites

- [Node.js](https://nodejs.org/) (npm)
- [Neutralinojs CLI](https://neutralino.js.org/docs/#/howto/install-neu) (`neu`)

## Development

```bash
# アプリの起動（デフォルトポート 8080）
neu run

# ポートを指定して起動
HOB_PORT=9090 neu run
```

起動すると以下が同時に開始されます:
1. Neutralinojs デスクトップウィンドウ（`resources/` をサーブ）
2. 拡張機能として `ext_server.js`（Node.js HTTP サーバ、`HOB_PORT` 環境変数で指定、デフォルト 8080）

## Testing

```bash
bash test.sh
```

テスト内容:
1. `POST /exec` が `{"status":"queued"}` を返す
2. `browser_console.log` に実行結果が記録されている
3. プロキシ経由で `https://example.com` の先頭行を取得できる
4. `GET /log` でログ内容を取得できる
5. `GET /status` で現在のURLを取得できる

## Configuration (`neutralino.config.json`)

| 設定 | 値 |
|---|---|
| Native API 許可 | `app.*`, `os.*`, `filesystem.*`, `extensions.*`, `debug.log` |
| 拡張機能 ID | `js.http.operated.browser.ext.nodeserver` |
| ウィンドウサイズ | 1200×800 (min 400×200) |
| インスペクタ | 有効 (F12) |
