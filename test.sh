#!/bin/bash
# HOB 動作確認スクリプト
# neu run が起動している状態で実行してください

HOB_PORT=${HOB_PORT:-8080}
BASE="http://localhost:${HOB_PORT}"

echo "=== 1. POST /exec (コード実行) ==="
curl -X POST "${BASE}/exec" \
  -H "Content-Type: application/json" \
  -d '{"code": "console.log(\"HOB OK\"); document.title;"}'
echo ""

echo ""
echo "=== 2. browser_console.log の内容 ==="
sleep 1
cat browser_console.log

echo ""
echo "=== 3. プロキシ経由のページ取得 ==="
curl -s "${BASE}/proxy?url=https://example.com" | head -5

echo ""
echo "=== 4. GET /log (ログ取得) ==="
curl -s "${BASE}/log" | head -10

echo ""
echo "=== 5. GET /status (現在のURL) ==="
curl -s "${BASE}/status"

echo ""
echo "=== 完了 ==="
