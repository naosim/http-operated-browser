# HTTP Operated Browser (HOB)

Puppeteer ベースの操作可能ブラウザ。HTTP API 経由で外部の AI エージェントやスクリプトが Chrome を制御し、任意の JavaScript 実行・DOM 取得・コンソール出力の収集が行えます。途中までユーザが手動操作し、そこから先を API で自動化する、といった使い方も可能です。

## Architecture

```
┌────────────────────────────────────────────┐
│  puppeteer_browser.js (Node.js)            │
│  ├─ Puppeteer で Chrome を起動 (GUI表示)   │
│  ├─ 1つの Page を制御                      │
│  └─ HTTP サーバ (port 8080)               │
│      ├─ POST /navigate → page.goto()      │
│      ├─ POST /exec     → page.evaluate()   │
│      ├─ GET  /dom      → page.content()    │
│      ├─ GET  /log      → console 蓄積      │
│      ├─ GET  /status   → page.url()        │
│      └─ POST /log      → カスタム追記      │
└────────────────────────────────────────────┘
```

Puppeteer が直接 Chrome を操作するため、プロキシ・HTML 注入・クロスオリジン対策は一切不要です。

## Design Philosophy

HOB は**テスト用途**を目的としています。Puppeteer が Chrome を直接制御するため、元のページの HTML にはまったく手を加えません。ナビゲーションも JavaScript 実行もすべて Puppeteer の API 経由で行われ、表示中のページに対する改変は一切発生しません。

## API Endpoints

### `POST /exec`

Chrome のページ内で任意の JavaScript を実行します。戻り値が直接レスポンスとして返ります。

```bash
curl -X POST http://localhost:8080/exec \
  -H "Content-Type: application/json" \
  -d '{"code": "document.title"}'
```

レスポンス: `{"result": "..."}` または `{"error": "..."}`

### `POST /navigate`

Chrome のタブを指定した URL に遷移させます。遷移完了（networkidle2）を待ってからレスポンスを返します。

```bash
curl -X POST http://localhost:8080/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

レスポンス: `{"url": "https://example.com", "title": "Example Domain"}`

### `GET /dom`

現在表示されているページの HTML を取得します（`page.content()`）。

```bash
curl -s "http://localhost:8080/dom" | head -40
```

レスポンス: `text/html; charset=utf-8`

### `GET /log`

ページ内の `console.log` / `console.error` などの出力を JSON 配列で取得します。

```bash
curl -s "http://localhost:8080/log"
```

レスポンス例:
```json
[
  {"id": 1, "timestamp": "2026-06-30T12:00:00.000Z", "level": "log", "text": "Hello"},
  {"id": 2, "timestamp": "2026-06-30T12:00:01.000Z", "level": "error", "text": "something broke"}
]
```

ログをクリア:
```bash
curl -s "http://localhost:8080/log?clear=1"
```

### `GET /status`

現在の URL とページタイトルを取得します。

```bash
curl -s "http://localhost:8080/status"
```

レスポンス: `{"url": "https://example.com", "title": "Example Domain"}`

### `GET /screenshot`

現在のページのスクリーンショットを PNG で取得します。

```bash
# 表示領域のみ
curl -s "http://localhost:8080/screenshot" -o page.png

# ページ全体（fullPage）
curl -s "http://localhost:8080/screenshot?full=true" -o page_full.png
```

### `POST /log`

カスタムログエントリを追記します。

```bash
curl -X POST http://localhost:8080/log \
  -H "Content-Type: application/json" \
  -d '{"text": "custom log entry"}'
```

## Typical AI Workflow

```bash
# 1. ページに移動（完了まで待機）
curl -X POST http://localhost:8080/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# 2. 現在の状態を確認
curl -s http://localhost:8080/status

# 3. ページのDOMを取得（画面の状態を読む）
curl -s http://localhost:8080/dom | head -40

# 4. DOMの内容から操作を判断し、JavaScript を実行
curl -X POST http://localhost:8080/exec \
  -H "Content-Type: application/json" \
  -d '{"code": "document.querySelector('"'"'button'"'"').click()"}'

# 5. console.log の出力をログから取得
sleep 1
curl -s http://localhost:8080/log

# 6. 必要に応じて再びDOMを取得して結果を確認
curl -s http://localhost:8080/dom | head -40
```

## Prerequisites

- [Node.js](https://nodejs.org/) (npm)

## Getting Started

```bash
# インストール
npm install

# 起動（Chrome ウィンドウが表示されます）
npm run dev

# 別のターミナルで操作
curl -X POST http://localhost:8080/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

初回起動時は Chromium のダウンロードが行われます（~300MB）。

## Environment Variables

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `HOB_PORT` | `8080` | HTTP API サーバのポート |
