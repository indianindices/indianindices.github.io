#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8000}"
PYTHON="${PYTHON:-python3}"

if [[ "${1:-}" == "--refresh" ]]; then
  "$PYTHON" build_sectoraldata.py
fi
"$PYTHON" export_data.py
mkdir -p .preview/docs .preview/vendor
cp index.html methodology.html ui-config.js app.js analytics.js research.js finance-calculations.js calculator.js waitlist.js support.js style.css data.json LICENSE NOTICE .preview/
cp vendor/simple-statistics.min.js vendor/simple-statistics.LICENSE vendor/financial.min.js vendor/financial.LICENSE .preview/vendor/
cp docs/*.svg .preview/docs/
cp docs/phonepe_gpay.jpeg docs/paypal.jpeg .preview/docs/
node scripts/generate-config.mjs .preview/supabase-config.js
echo "Serving on http://localhost:$PORT  (Ctrl+C to stop)"
exec "$PYTHON" -m http.server "$PORT" --bind 127.0.0.1 --directory .preview
