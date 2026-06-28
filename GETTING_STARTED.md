# Getting Started with HOB

## Requirements

- [Node.js](https://nodejs.org/) (npm 付属)
- Neutralinojs CLI

```bash
npm install -g @neutralinojs/neu
```

## Quick Start

```bash
git clone <repository-url>
cd http-operated-browser
neu run
```

ブラウザウィンドウが開きます。アドレスバーに `https://example.com` と入力して Enter を押すと、プロキシ経由でページが表示されます。

## Control via curl

アプリ起動中、別のターミナルからブラウザを操作できます。

### Navigate to a page

```bash
curl -X POST http://localhost:8080/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

ブラウザの iframe が指定したページに遷移します。

### Execute JavaScript

```bash
curl -X POST http://localhost:8080/exec \
  -H "Content-Type: application/json" \
  -d '{"code": "document.title"}'
```

### Read the log (get results)

```bash
curl -s http://localhost:8080/log | tail -5
```

### Check current URL

```bash
curl -s http://localhost:8080/status
```

### Get the page DOM

```bash
curl -s http://localhost:8080/dom | head -20
```

## Typical AI loop

```bash
# 1. 移動
curl -X POST http://localhost:8080/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

sleep 1

# 2. JS を実行
curl -X POST http://localhost:8080/exec \
  -H "Content-Type: application/json" \
  -d '{"code": "document.title"}'

sleep 1

# 3. 結果を取得
curl -s http://localhost:8080/log | tail -5

# 4. ページのDOMを取得
curl -s http://localhost:8080/dom | head -20
```

## Troubleshooting

| 現象 | 対処 |
|---|---|
| ポート 8080 が既に使われている | `HOB_PORT=9090 neu run` でポート変更 |
| `neu: command not found` | `npm install -g @neutralinojs/neu` を実行 |
| ページが表示されない | アドレスバーのURLが `http://` または `https://` で始まっているか確認 |
| curl が通らない | `neu run` が起動中か確認 |

---

API の詳細なリファレンスは [README.md](README.md) を参照してください。
