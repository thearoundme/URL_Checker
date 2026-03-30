# Start the API without needing `uvicorn` on PATH (Python's Scripts folder is often omitted from PATH on Windows).
# Usage:  cd ...\backend   then   .\run-dev.ps1
Set-Location $PSScriptRoot
$ErrorActionPreference = "Stop"
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
