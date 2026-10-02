#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8000}"
PYTHON="${PYTHON:-python3}"

if [[ "${1:-}" == "--refresh" ]]; then
  "$PYTHON" build_sectoraldata.py
fi
"$PYTHON" export_data.py
echo "Serving on http://localhost:$PORT  (Ctrl+C to stop)"
exec "$PYTHON" -m http.server "$PORT" --bind 127.0.0.1 --directory .
