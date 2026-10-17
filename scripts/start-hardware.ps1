$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:PYTHONUTF8 = '1'
$env:CAN_ENABLE_HARDWARE = '1'
$env:CAN_DEFAULT_SOURCE = 'obdlink'
# Explicit operator entry point. No auto-connect and no automatic recording.
& ./.venv/Scripts/python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
exit $LASTEXITCODE
