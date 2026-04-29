#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PYTHONPATH="$ROOT_DIR/src"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-7860}"
DOWNLOAD_FIRERED_ASSETS="${DOWNLOAD_FIRERED_ASSETS:-true}"

if [ "$DOWNLOAD_FIRERED_ASSETS" = "true" ]; then
  if [ ! -f "$ROOT_DIR/.storyline/models/transnetv2-pytorch-weights.pth" ] || [ ! -d "$ROOT_DIR/resource/bgms" ]; then
    echo "FireRed runtime assets missing; running download.sh before service start."
    (cd "$ROOT_DIR" && ./download.sh)
  fi
fi

python -m open_storyline.mcp.server &
MCP_PID=$!

uvicorn agent_fastapi:app \
  --host "$HOST" \
  --port "$PORT" &
WEB_PID=$!

trap 'kill $MCP_PID $WEB_PID' INT TERM

wait -n "$MCP_PID" "$WEB_PID"
EXIT_CODE=$?

kill "$MCP_PID" "$WEB_PID" 2>/dev/null || true
wait "$MCP_PID" "$WEB_PID" 2>/dev/null || true

exit "$EXIT_CODE"
