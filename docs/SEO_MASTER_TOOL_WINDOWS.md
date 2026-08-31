# SEO Master Tool on Windows 11

This fork keeps OpenSEO's upstream architecture while adding a repeatable,
local-only Windows 11 development profile for SEO Master Tool.

## Prerequisites

1. Windows 11 with WSL 2 enabled.
2. Docker Desktop configured to use the WSL 2 backend.
3. Git.
4. At least 8 GB of free memory while building the image.

The application container uses Node 22. Developers running commands outside
Docker should also use Node 22. The repository includes `.nvmrc` and a matching
`package.json` engine constraint.

## First start

Open PowerShell in the repository root and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\windows\Start-SeoMasterTool.ps1
```

The script:

- verifies Docker Desktop is running;
- creates `.env` from `.env.example` when needed;
- enables trusted local mode;
- disables anonymous telemetry;
- generates a local token-encryption secret;
- builds this fork rather than pulling the upstream image; and
- starts the app at `http://localhost:3001`.

The Compose port is bound to `127.0.0.1`. Do not change this to `0.0.0.0`
without first adding authentication, HTTPS, and an access-controlled reverse
proxy.

## Connect DataForSEO

Open `.env` and set `DATAFORSEO_API_KEY` to the base64 encoding of:

```text
DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD
```

In PowerShell:

```powershell
$raw = "DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD"
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($raw))
```

Restart after changing `.env`:

```powershell
docker compose -f compose.yaml -f compose.windows.yaml up -d --build --force-recreate
```

## Connect Google Search Console and GA4

Follow the upstream guides:

- `docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`
- `docs/SELF_HOSTING_GOOGLE_ANALYTICS.md`

Use these local OAuth callback paths:

```text
http://localhost:3001/api/gsc/oauth/callback
http://localhost:3001/api/ga4/oauth/callback
```

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the generated
`BETTER_AUTH_SECRET` in `.env`, then recreate the container.

## Operations

### Start or update

```powershell
.\scripts\windows\Start-SeoMasterTool.ps1
```

### Start without rebuilding

```powershell
.\scripts\windows\Start-SeoMasterTool.ps1 -SkipBuild
```

### View logs

```powershell
docker compose -p seo-master-tool logs -f open-seo
```

### Stop

```powershell
docker compose -f compose.yaml -f compose.windows.yaml down
```

### Back up

```powershell
.\scripts\windows\Backup-SeoMasterTool.ps1
```

Backups default to `SEO-Master-Tool-Backups` in the current Windows user's home
directory.

### Restore

```powershell
.\scripts\windows\Restore-SeoMasterTool.ps1 -Archive "C:\path\to\backup.tar.gz"
```

Restore deliberately requires typing `RESTORE` because it replaces the current
local data volume.

## Phase 0 verification checklist

- [ ] Docker Desktop reports the WSL 2 engine is running.
- [ ] `Start-SeoMasterTool.ps1` builds without errors.
- [ ] `http://localhost:3001/api/health` reports a healthy database.
- [ ] The app opens at `http://localhost:3001`.
- [ ] A project can be created and survives a container restart.
- [ ] DataForSEO account usage or a low-cost keyword request succeeds.
- [ ] One Search Console property connects and returns data.
- [ ] One GA4 property connects and returns data.
- [ ] A backup archive can be created.
- [ ] A test project survives a restore.

## Phase 0 acceptance gate

Phase 0 is complete when every checklist item passes on the target Windows 11
machine. Real provider verification cannot be completed in CI or an untrusted
remote environment because it requires the owner's API credentials and Google
OAuth consent.
