# Build WatchTower Windows executables

WatchTower is packaged as a Windows desktop application. The end-user does **not** need Node.js, npm, PostgreSQL, or a `.bat` launcher installed.

## What the package contains

- Electron desktop window and local Next.js application server (`resources\watchtower-server`, including its `node_modules`)
- Embedded PGlite (PostgreSQL-compatible) database
- Win32 monitoring agent (`resources\agent\watchtower-agent.ps1`), started and stopped by the desktop host
- Local data, backups and logs under `%APPDATA%\WatchTower`

## Outputs

| File | Description |
| --- | --- |
| `release\WatchTower-Setup-<version>.exe` | NSIS installer (per-user, Desktop + Start Menu shortcuts, launches WatchTower when finished) |
| `release\WatchTower-Portable-<version>-x64.exe` | Single portable executable |
| `release\win-unpacked\` | Unpacked app, used by the automated tests |

## Recommended: build on GitHub Actions

1. Push to `main` (or open **Actions → Build WatchTower for Windows → Run workflow**).
2. The workflow runs on a Windows x64 runner: `npm ci`, TypeScript check, Next.js build, standalone cleanup, packaging, executable checks, the package/runtime tests and an end-to-end launch of the packaged app.
3. Download the artifact `WatchTower-Windows-x64-v<version>` from the completed run. The workflow fails if either `.exe` is missing.

### Public releases

Push a version tag that matches `package.json` (for example `v0.1.1`):

```powershell
git tag v0.1.1
git push origin v0.1.1
```

`release-windows.yml` builds the executables, runs the same checks, and publishes a GitHub Release with both `.exe` files, `SHA256SUMS.txt` and the notes from `release-notes\v<version>.md`. It uses only the built-in `GITHUB_TOKEN`; electron-builder always runs with `--publish never`.

## Build locally on Windows

Install Node.js 24 and Git, then in PowerShell in this folder:

```powershell
npm ci
npm run typecheck
npm run desktop:package        # build + desktop:clean + installer + portable
npm run desktop:dir            # faster: only release\win-unpacked
npm test                       # package-resource and server-runtime tests (needs desktop:dir/desktop:package first)
npm run test:packaged          # launches the packaged app end-to-end in a temporary data directory
node scripts/verify-packaged.cjs release\WatchTower-Portable-2.1.0-x64.exe   # same checks against another exe
```

### Packaging note (the v0.1.0 startup bug)

electron-builder always drops a **root-level `node_modules`** folder from an `extraResources` source. v0.1.0 copied `.next/standalone` as one resource, so the packaged server had no `next`, `react` or PGlite and crashed at once with `Cannot find module 'next'`. `package.json` therefore copies `.next/standalone/node_modules` as its own `extraResources` entry. `tests/package-resources.test.cjs` and `tests/server-runtime.test.cjs` fail if this regresses, and the desktop host validates the bundle before starting the server.

## End-user launch

- **Installer:** double-click `WatchTower-Setup-<version>.exe`, complete setup, then launch WatchTower from the Desktop or Start menu.
- **Portable:** double-click `WatchTower-Portable-<version>-x64.exe`.

WatchTower stores its data in the current Windows user's `%APPDATA%\WatchTower`:

- `database\` — embedded PGlite database
- `backups\` — automatic and manual JSON backups
- `logs\watchtower-startup.log` — startup, server and shutdown diagnostics
- `logs\watchtower-agent.log` — monitoring agent output

If WatchTower cannot start, the error dialog names the cause and offers **Open log folder**.

Setting the `WATCHTOWER_DATA_DIR` environment variable to an absolute path relocates all of this (used by the automated tests).

## Limitations

- The packages are not code-signed; Windows SmartScreen may warn on first launch.
- The monitor runs while WatchTower is open; an always-on Windows service is not included.
- UAC secure desktop, protected processes and sign-in screens expose limited process metadata; WatchTower reports this rather than bypassing Windows security.

## Code signing (optional)

`electron-builder` signs the application, the installer and the portable executable automatically when a **trusted** code-signing certificate is available. Provide it only through environment variables (never commit a certificate or a password):

| Variable | Meaning |
| --- | --- |
| `CSC_LINK` | path, https URL or base64 of the `.pfx` / `.p12` certificate |
| `CSC_KEY_PASSWORD` | the certificate password |
| `CSC_NAME` | alternatively, the subject name of a certificate already installed in the Windows certificate store |

- `npm run sign:status` reports whether signing is configured (it never prints secrets).
- `node scripts/signing-status.cjs --check release\*.exe` reports the Authenticode state of the built files (`--require-signed` makes unsigned files an error).
- Without a certificate the build is produced **unsigned**. A self-signed certificate does not create a trusted publisher and is not used. Even a validly signed build does not guarantee instant SmartScreen reputation.

## Regenerating the README logo animation

`node scripts/make-logo-animation.cjs [variant] [outFile]` renders `docs/images/watchtower-logo-rotating.webp` from the same 3D scene as the app (needs Microsoft Edge or Chrome installed).
