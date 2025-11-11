param(
  [string]$PythonEmbedDir = "apps/api/python-embed"
)

$ErrorActionPreference = "Stop"

# Paths
$py = Join-Path $PythonEmbedDir "python.exe"
$pip = Join-Path $PythonEmbedDir "Scripts/pip.exe"

if (-not (Test-Path $py)) {
  Write-Error "Embedded Python not found: $py"
}
if (-not (Test-Path $pip)) {
  Write-Error "Embedded pip not found: $pip"
}

Write-Host "Installing Crawl4AI and dependencies with embedded pip..." -ForegroundColor Cyan

# Base deps for fallback parsing
& $pip install --disable-pip-version-check --no-input --upgrade pip
& $pip install --no-input beautifulsoup4 lxml readability-lxml trafilatura

# Install crawl4ai
& $pip install --no-input crawl4ai

# Optional: Playwright for dynamic rendering
try {
  & $pip install --no-input playwright
  & $py -m playwright install chromium
} catch {
  Write-Warning "Playwright install failed or skipped. If needed, run: python -m playwright install"
}

Write-Host "Install completed." -ForegroundColor Green
