@echo off
REM Double-click or run: backend\run-dev.bat  (no PowerShell execution-policy needed)
cd /d "%~dp0"
python -m pip install -r requirements.txt -q
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
