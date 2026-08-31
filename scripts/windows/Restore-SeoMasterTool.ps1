[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Archive
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$archivePath = (Resolve-Path $Archive).Path
$archiveDirectory = Split-Path $archivePath
$archiveName = Split-Path $archivePath -Leaf
$volumeName = "seo-master-tool_open_seo_data"

Write-Warning "This replaces all current local SEO Master Tool data with the selected backup."
$confirmation = Read-Host "Type RESTORE to continue"
if ($confirmation -ne "RESTORE") {
  Write-Host "Restore cancelled."
  exit 0
}

Push-Location $repoRoot
try {
  docker compose -f compose.yaml -f compose.windows.yaml down
  if ($LASTEXITCODE -ne 0) {
    throw "Could not stop the application."
  }

  docker volume create $volumeName | Out-Null
  docker run --rm `
    --volume "${volumeName}:/data" `
    --volume "${archiveDirectory}:/backup:ro" `
    alpine:3.21 `
    sh -c "rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null || true; tar -xzf '/backup/$archiveName' -C /data"

  if ($LASTEXITCODE -ne 0) {
    throw "Restore failed with exit code $LASTEXITCODE."
  }

  docker compose -f compose.yaml -f compose.windows.yaml up -d
  if ($LASTEXITCODE -ne 0) {
    throw "Data was restored, but the application did not restart successfully."
  }

  Write-Host "Restore complete. SEO Master Tool is starting at http://localhost:3001" -ForegroundColor Green
} finally {
  Pop-Location
}
