$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$env:UV_CACHE_DIR = Join-Path $projectRoot '.cache/uv'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $projectRoot '.python'
if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv python install 3.12
    if ($LASTEXITCODE) { throw 'Python installation failed' }
    uv sync --extra dev --frozen
} else {
    py -3.12 -m venv .venv
    if ($LASTEXITCODE) { throw 'Install Python 3.12 or uv first' }
    & ./.venv/Scripts/python.exe -m pip install -e '.[dev]'
}
if ($LASTEXITCODE) { throw 'Backend dependency installation failed' }
Push-Location frontend
try {
    npm.cmd ci --cache ../.cache/npm
    if ($LASTEXITCODE) { throw 'Frontend dependency installation failed' }
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $projectRoot '.cache/ms-playwright'
    npx.cmd playwright install chromium
    if ($LASTEXITCODE) { throw 'Test browser installation failed' }
} finally { Pop-Location }
Write-Host 'Ready. Run scripts/start-backend.ps1 and scripts/start-frontend.ps1 in separate terminals.'
