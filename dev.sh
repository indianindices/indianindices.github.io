#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8000}"
PYTHON="${PYTHON:-python3}"

if [[ "${1:-}" == "--refresh" ]]; then
  "$PYTHON" backend/build_sectoraldata.py
fi
"$PYTHON" backend/export_data.py
mkdir -p .preview/assets .preview/vendor
(
  cd frontend
  cp index.html methodology.html ui-config.js app.js analytics.js research.js finance-calculations.js calculator.js backtest.js personalization.js waitlist.js support.js style.css data.json ../.preview/
  cp vendor/simple-statistics.min.js vendor/simple-statistics.LICENSE vendor/financial.min.js vendor/financial.LICENSE ../.preview/vendor/
  cp assets/*.svg assets/lucide.LICENSE assets/phonepe_gpay.jpeg assets/paypal.jpeg ../.preview/assets/
)
cp LICENSE NOTICE .preview/
node backend/scripts/generate-config.mjs .preview/supabase-config.js
echo "Serving on http://localhost:$PORT  (Ctrl+C to stop)"
exec "$PYTHON" -m http.server "$PORT" --bind 127.0.0.1 --directory .preview
