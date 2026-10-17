$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:PYTHONUTF8 = '1'
& ./.venv/Scripts/python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
exit $LASTEXITCODE
