[CmdletBinding()]
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$envPath = Join-Path $repoRoot ".env"
$envExamplePath = Join-Path $repoRoot ".env.example"

function Assert-Command {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install Docker Desktop and enable its WSL 2 backend."
  }
}

Assert-Command -Name "docker"

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is installed but is not running. Start Docker Desktop, wait for it to become ready, and run this script again."
}

if (-not (Test-Path $envPath)) {
  Copy-Item $envExamplePath $envPath
  $secretBytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
  $secret = [Convert]::ToBase64String($secretBytes)

  Add-Content -Path $envPath -Value @"

# SEO Master Tool local defaults
AUTH_MODE=local_noauth
PORT=3001
OPENSEO_TELEMETRY_DISABLED=1
BETTER_AUTH_SECRET=$secret
"@

  Write-Host "Created .env with safe local defaults." -ForegroundColor Green
  Write-Host "Add DATAFORSEO_API_KEY to .env before using paid SEO data." -ForegroundColor Yellow
}

Push-Location $repoRoot
try {
  $composeArgs = @(
    "compose",
    "-f", "compose.yaml",
    "-f", "compose.windows.yaml",
    "up", "-d"
  )

  if (-not $SkipBuild) {
    $composeArgs += "--build"
  }

  & docker @composeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed with exit code $LASTEXITCODE."
  }

  Write-Host ""
  Write-Host "SEO Master Tool is starting at http://localhost:3001" -ForegroundColor Green
  Write-Host "Run 'docker compose -p seo-master-tool logs -f open-seo' to follow startup." -ForegroundColor Cyan
} finally {
  Pop-Location
}
