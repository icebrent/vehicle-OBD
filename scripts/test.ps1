$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:PYTHONUTF8 = '1'
$testRunRoot = Join-Path (Get-Location) ('.cache/test-runs/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRunRoot -Force | Out-Null
& ./.venv/Scripts/ruff.exe check backend tests scripts
if ($LASTEXITCODE) { throw 'Lint failed' }
& ./.venv/Scripts/python.exe -m pytest -q --basetemp (Join-Path $testRunRoot 'tmp') -o ('cache_dir=' + (Join-Path $testRunRoot 'cache'))
if ($LASTEXITCODE) { throw 'Backend tests failed' }
Push-Location frontend
try {
    npm.cmd run format:check
    if ($LASTEXITCODE) { throw 'Frontend formatting check failed' }
    npm.cmd test
    if ($LASTEXITCODE) { throw 'Frontend unit tests failed' }
    npm.cmd run build
    if ($LASTEXITCODE) { throw 'Frontend build failed' }
    npm.cmd run test:e2e
    if ($LASTEXITCODE) { throw 'Browser tests failed' }
} finally { Pop-Location }
