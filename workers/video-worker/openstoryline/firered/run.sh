#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PYTHONPATH="$ROOT_DIR/src"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-7860}"
DOWNLOAD_FIRERED_ASSETS="${DOWNLOAD_FIRERED_ASSETS:-true}"
VIDEO_WORKER_HOST_ROOT="${VIDEO_WORKER_HOST_ROOT:-}"
DEFAULT_OPENSTORYLINE_CONFIG="$ROOT_DIR/config.video_edit_engine.toml"

if [ -z "${OPENSTORYLINE_CONFIG:-}" ] \
  || [ "${OPENSTORYLINE_CONFIG}" = "config.aliyun-no-asr.toml" ] \
  || [ "${OPENSTORYLINE_CONFIG}" = "$ROOT_DIR/config.aliyun-no-asr.toml" ]; then
  export OPENSTORYLINE_CONFIG="$DEFAULT_OPENSTORYLINE_CONFIG"
fi

if [ -n "$VIDEO_WORKER_HOST_ROOT" ]; then
  FIRERED_RUNTIME_ROOT="$VIDEO_WORKER_HOST_ROOT/firered"

  for runtime_dir in .storyline resource outputs; do
    if [ ! -e "$ROOT_DIR/$runtime_dir" ] && [ -e "$FIRERED_RUNTIME_ROOT/$runtime_dir" ]; then
      ln -s "$FIRERED_RUNTIME_ROOT/$runtime_dir" "$ROOT_DIR/$runtime_dir"
    fi
  done
fi

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
