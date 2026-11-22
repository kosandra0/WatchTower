# WatchTower — Windows Usage Intelligence

<p align="center">
  <img src="docs/images/watchtower-logo-rotating.webp" width="200" alt="WatchTower: the rotating 3D watchtower logo with its sweeping yellow searchlight">
</p>

> WatchTower was formerly called Chronos. An older `%APPDATA%\Chronos` data folder is moved to `%APPDATA%\WatchTower` automatically.

WatchTower is packaged as a Windows desktop application. Open the installed app or the portable `.exe`; the desktop host starts the local application server and the Windows monitoring agent automatically.

## What's new in 2.1.0

- **Complete tray menu:** the quick panel that opens from the tray icon now lists all 12 pages (Focus, Limits, Productivity, Projects and Reports were missing). It is generated from the same list as the sidebar, so new pages can't be forgotten again.
- **Faster levelling (2.25x):** each level needs about 44% of the previous XP (Level 2 at 44 XP, Level 5 at 444, Level 10 at 2,000). Achievement XP values and earned XP are unchanged, so an existing install may jump up a few levels once.

Details: [release-notes/v2.1.0.md](release-notes/v2.1.0.md).

## What's new in 2.0.0

- **Focus mode** with short/long breaks, gentle eye-rest reminders and a timer that survives restarts and sleep.
- **Application limits** (per application or category) that warn you at your threshold and when the limit is reached. They never block anything.
- **Weekly screen-time report** for the last completed week, delivered once a week as a desktop notification.
- **Productivity classes and goals** (productive / neutral / distracting) with a daily score and goal progress.
- **Compare periods**: this week vs last week and this month vs last month.
- **Projects and client time reports** with billable time, hourly rates, currencies and CSV export.
- **Automatic theme schedule** and **theme packs** (save, preview, export and safely import gradient presets).
- **Update checks** against this repository's releases, with SHA-256 verification and install only after you agree.
- **Applications** now has the same period selector as Statistics (Today ... All Time, Custom).
- Sliding-digit numbers on the new pages, smooth Settings transitions and a redesigned Level / XP card.

The full list is in [release-notes/v2.0.0.md](release-notes/v2.0.0.md).

## Windows executable build

See [BUILD-WINDOWS.md](BUILD-WINDOWS.md) for the recommended GitHub Actions workflow and local Windows build steps. The build produces:

- **WatchTower Setup** — a per-user Windows installer that creates Start Menu and Desktop shortcuts.
- **WatchTower Portable** — one standalone Windows `.exe` that can be double-clicked without installing the app.

Neither package requires a `.bat` launcher, a separately installed Node.js runtime, or a PostgreSQL service.

## Desktop architecture

| Part | Technology | Purpose |
| --- | --- | --- |
| Desktop host | Electron 45 | Opens the Windows desktop window and manages child processes |
| User interface | Next.js 16, React 19, TypeScript, Recharts, Framer Motion, Lucide | Overview, statistics, heat map, applications, sessions, timeline, achievements and settings |
| Local web server | Next.js standalone output | Serves the UI and the local API on loopback only |
| Database | PGlite + Drizzle ORM | Embedded PostgreSQL-compatible database; no external database service |
| Windows monitor | PowerShell + Win32 P/Invoke | Detects foreground app, desktop, idle/locked state and reports sessions locally |

The local server binds to `127.0.0.1` on an automatically selected available port. It is not exposed to the local network.

## Tracking behavior

- The Windows agent polls locally every 500 ms and sends transitions plus a 5-second heartbeat.
- Foreground detection uses `GetForegroundWindow`, `GetWindowThreadProcessId`, `OpenProcess` and `QueryFullProcessImageNameW`.
- Desktop shell, idle periods, secure desktop/lock state and supported UWP-hosted apps are classified separately.
- If a process cannot be inspected due to Windows permissions, the app records the best available process identity and marks detection as limited. It does not bypass Windows protections.
- Background processes do not add to foreground screen-time totals.
- The agent is started when WatchTower opens and stopped when WatchTower exits. Keep WatchTower open (or minimized) for continuous monitoring.
- The app does not capture keystrokes, clipboard contents, screenshots, audio, video, passwords or browser page contents. Window-title collection is optional and disabled by default.

## Data and backups

WatchTower stores its persistent database and backups under:

`%APPDATA%\WatchTower\`

Expected subdirectories:

- `database\` — embedded PGlite database
- `backups\` — automatic and manual JSON backups
- `logs\` — `watchtower-startup.log` (startup, server and shutdown diagnostics) and `watchtower-agent.log` (monitoring agent output)

The database is created automatically on first launch. Timestamps are stored as UTC `timestamptz`; durations are 64-bit integer milliseconds. Daily statistics are derived from session records so they can be rebuilt.

Export formats: JSON, Markdown and TXT. All three formats (JSON, Markdown and TXT) contain every record (including projects, session assignments, limits, productivity choices and theme presets) and can be imported back; Markdown and TXT reports end with a machine-readable data block.

## First launch and validation

1. Double-click the installed WatchTower shortcut or `WatchTower-Portable-*.exe`.
2. Allow WatchTower to run if Windows prompts about the downloaded executable. Unsigned builds may display a SmartScreen warning.
3. Wait for the dashboard to open; the local database initializes automatically. If startup fails, the error names the cause and offers to open `%APPDATA%\WatchTower\logs`.
4. Switch between Notepad, PowerShell, browser windows and the desktop. Confirm the current app and session list change.
5. Leave the computer idle beyond the configured threshold and confirm Idle is recorded separately.
6. Close and reopen WatchTower, then confirm the historical sessions remain.

## Known limitations

- Automated checks cover launch, health, agent heartbeat, foreground tracking and persistence. Verify idle transitions, elevated-process limitations and lock/resume behavior on your own PC.
- UAC secure desktop, protected processes, Windows sign-in screens, disconnected sessions and other OS-protected surfaces may not expose normal foreground-process metadata. WatchTower reports detection limitations rather than bypassing OS security.
- The monitor runs while WatchTower is open. A Windows service / always-on startup component is not included in this packaging pass.
- The desktop package is not code-signed. Windows SmartScreen may show an unfamiliar-app warning until the binary is signed and its reputation is established. Signing is supported by the build (see [BUILD-WINDOWS.md](BUILD-WINDOWS.md)) but needs a trusted certificate, which the published builds do not use yet.
- The portable build cannot update itself; use the installer for automatic update checks.
