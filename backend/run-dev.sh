#!/usr/bin/env bash
# Start the URL_Check API on macOS/Linux (same as run-dev.ps1 on Windows).
# Usage: cd URL_Checker/backend && chmod +x run-dev.sh && ./run-dev.sh

set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
"$PY" -m pip install -r requirements.txt
exec "$PY" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
