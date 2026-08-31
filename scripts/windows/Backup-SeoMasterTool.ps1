[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $HOME "SEO-Master-Tool-Backups")
)

$ErrorActionPreference = "Stop"
$volumeName = "seo-master-tool_open_seo_data"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archiveName = "seo-master-tool-$timestamp.tar.gz"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker was not found."
}

if (-not (docker volume ls --quiet --filter "name=^${volumeName}$")) {
  throw "The Docker volume '$volumeName' does not exist. Start SEO Master Tool once before creating a backup."
}

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$resolvedDestination = (Resolve-Path $Destination).Path

docker run --rm `
  --volume "${volumeName}:/data:ro" `
  --volume "${resolvedDestination}:/backup" `
  alpine:3.21 `
  tar -czf "/backup/$archiveName" -C /data .

if ($LASTEXITCODE -ne 0) {
  throw "Backup failed with exit code $LASTEXITCODE."
}

Write-Host "Backup created: $(Join-Path $resolvedDestination $archiveName)" -ForegroundColor Green
