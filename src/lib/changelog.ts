// Add future releases at the TOP of this array. No release history is invented.

export type ChangelogEntry = {
  version: string;
  date: string;
  label: string;
  features: string[];
  improvements: string[];
  fixes: string[];
  knownIssues: string[];
};

export const APP_VERSION = "2.1.0";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.1.0",
    date: "2026-11-22",
    label: "Complete tray menu and faster levelling",
    features: [],
    improvements: [
      "Levelling is 2.25 times faster: each level now needs about 44% of the XP it needed before (Level 2 at 44 XP, Level 5 at 444 XP, Level 10 at 2,000 XP). Achievement XP values are unchanged and your earned XP is kept, so your level may jump up once after updating",
      "The quick panel that opens from the tray icon is now built from the same page list as the sidebar, so any page added in future appears in both automatically",
    ],
    fixes: [
      "The tray quick panel was missing Focus, Limits, Productivity, Projects and Reports; it now lists all 12 pages",
    ],
    knownIssues: ["Windows builds are not code-signed; SmartScreen may warn on first launch."],
  },
  {
    version: "2.0.1",
    date: "2026-11-21",
    label: "Security update and smoother page loads",
    features: [],
    improvements: [
      "Pages load faster: the window no longer throws away and rebuilds the page on every full load (the title bar and updater panel now wait for the desktop bridge instead of making the first render differ from the server)",
    ],
    fixes: [
      "Updated Next.js from 16.4.2 to 16.4.6, which fixes the published information-disclosure and cache-leak advisories for server caching functions",
      "Fixed React hydration errors (#418/#519) that appeared in the logs on full page loads",
    ],
    knownIssues: ["Windows builds are not code-signed; SmartScreen may warn on first launch."],
  },
  {
    version: "2.0.0",
    date: "2026-11-21",
    label: "Focus, limits, projects and automatic updates",
    features: [
      "Focus mode: a calm focus timer with short and long breaks, optional automatic transitions, gentle eye-rest and stretch reminders, and a timer that survives restarts and sleep",
      "Application limits: daily time limits per application or category with a warning threshold and a notice when the limit is reached. WatchTower only warns you, it never blocks anything",
      "Weekly screen-time report: a summary of the last completed week with comparison, top applications and categories, delivered once a week as a desktop notification at the day and time you choose",
      "Productivity classification: mark applications productive, neutral or distracting, see a daily productivity score and track a daily productive-time goal",
      "Compare periods: this week against last week and this month against last month, with application and category changes, in Statistics and Reports",
      "Projects and client time reports: create projects with clients, colours and hourly rates, assign sessions from Session details, and export a CSV time report with billable time and estimated amounts",
      "Automatic theme schedule: pick a daytime and a night-time theme and the times they start",
      "Theme packs: save, preview, edit and delete named gradient presets, export them as a versioned file and import packs safely",
      "Update checks against the official GitHub releases: see the new version and its notes, download with progress, verify the SHA-256 checksum and install when you agree",
      "Windows code-signing support in the build pipeline (a trusted certificate is still required to produce signed files)",
    ],
    improvements: [
      "Applications now has the same period selector as Statistics (Today, Yesterday, This/Last Week, Month, Year, All Time, Custom) and every column follows the chosen period",
      "Exports and imports now also carry projects and session assignments, limits, productivity choices and saved theme presets",
      "Numbers on Focus, Limits, Productivity, Projects, Reports and Compare now slide up and update live, just like the rest of WatchTower",
      "Settings sections glide smoothly from one to the next, with a sliding highlight in the menu, instead of switching instantly",
      "Redesigned Level and XP card on the Overview and Achievements: one shared glass design with a crest, a gradient progress bar and a thin, soft glow when you hover it, in every theme",
    ],
    fixes: [],
    knownIssues: ["Windows builds are not code-signed unless a trusted certificate is supplied at build time; SmartScreen may warn on first launch.", "The portable build cannot replace itself; it opens the release page instead."],
  },
  {
    version: "1.1.0",
    date: "2026-11-20",
    label: "Twenty new themes, your own gradient and more fonts",
    features: [
      "Twenty new dark themes: Obsidian Calm, Deep Teal, Northern Aurora, Arctic Twilight, Indigo Dusk, Plum Velvet, Amethyst Night, Wine Cellar, Ember Charcoal, Copper Night, Olive Grove, Moss Stone, Cedar Wood, Graphite Blue, Ink Navy, Charcoal Mint, Storm Cloud, Midnight Rose, Dusk Gold and Space Violet",
      "Custom Gradient theme: pick two or three colours, the direction and your own accent, or start from one of eight presets; text and surfaces adapt automatically so light or dark gradients stay readable",
      "Sixteen more fonts: Times New Roman, Georgia, Cambria, Palatino Linotype, Garamond, Book Antiqua, Calibri, Arial, Verdana, Tahoma, Trebuchet MS, Cascadia Code, plus bundled Merriweather, Source Serif, Playfair Display and IBM Plex Sans that also work offline",
    ],
    improvements: [
      "Dropdown menus are now rounded, themed and animated instead of the square system list, with keyboard control (arrows, Enter, Escape, type to jump) and a check mark on the current choice",
      "Dropdowns open upward automatically near the bottom of the window and are never clipped by cards",
      "The font list previews every font in its own typeface",
    ],
    fixes: [
      "Settings showed \"This page couldn't load\" after installing over an older copy: a stale page cache from the previous version is now cleared every time WatchTower starts",
    ],
    knownIssues: ["Windows builds are not code-signed; SmartScreen may warn on first launch.", "System fonts such as Times New Roman or Calibri fall back to a similar font on computers that do not have them."],
  },
  {
    version: "1.0.0",
    date: "2026-11-20",
    label: "WatchTower 1.0",
    features: [
      "Renamed to WatchTower with a live, rotating 3D watchtower logo and its yellow searchlight",
      "Rounded, frameless window with five title bar styles: Windows, macOS traffic lights, Minimal, Floating and Classic",
      "System tray with a small rounded quick panel: live time, page shortcuts, open or quit",
      "Real desktop options: launch at Windows startup, start minimized, minimize or close to tray, confirm before exit",
      "Heat Map now lives inside Statistics as its own tab",
      "Live statistics: every figure refreshes in real time and slides up as it changes",
      "Application distribution shows live, sliding times",
      "Personal greeting: type your name beside the greeting on the Overview",
      "Level and XP card at the top of the Overview, next to your daily goal",
      "Thirty-plus new achievements across time, streaks, apps, exploration and personalisation",
      "Import and export notifications show exactly where a file was saved or what was imported",
      "Developer contact cards in About with official Instagram, Telegram and Discord logos",
      "Update Logs reorganised into a version menu with a detail panel per release",
      "Filters, sort order and date ranges are remembered across menus and restarts (Applications, Sessions, Statistics, Heat Map)",
      "Heat Map: clicking a cell in the Hourly view shows a Selected hour panel; the Weekly view shows a Selected weekday panel",
      "Live HH:MM:SS times with sliding digits across Statistics, Applications, Sessions, Timeline and the Heat Map, refreshed every second",
      "Custom app icon: the watchtower is now the taskbar, installer and tray icon",
      "Five live 3D watchtower logos (Classic Tower, Seaside Lighthouse, Stone Keep, Pagoda Watch, Sky Observer) with rotating previews in Appearance; the choice applies to the sidebar, tray, taskbar, Start and Desktop shortcuts and the launcher file",
      "Timeline: an Inspect button below the date range opens the selected session in a window, no more scrolling",
      "Launch in the system tray option: ON opens hidden in the tray, OFF opens directly in front of you",
      "Markdown and text reports now carry a complete data block and import back losslessly, just like JSON",
      "Full data export: achievement seen flags, achievement events, backup details, exact termination reasons and custom categories are all exported and restored",
    ],
    improvements: [
      "Theme picker laid out as a responsive horizontal grid",
      "Settings layout adapts cleanly at any zoom level",
      "Smooth fade-in and fade-out notifications in the bottom-right corner",
      "Renamed to WatchTower everywhere: installer, launcher, folders and the data folder (an existing Chronos data folder is moved automatically)",
    ],
    fixes: [
      "Window corners were square: the window is now frameless and genuinely rounded",
      "Statistics figures only refreshed after switching menus; they now update live",
      "Settings sections overlapped when zoomed",
      "Desktop shell options were shown as unavailable; they are now implemented",
      "Heat Map cells in the Hourly and Weekly views did nothing when clicked, and the panel always said Selected day",
      "Applications, Sessions and Timeline only updated after switching menus; they now update in real time",
      "Installer size: build outputs are no longer packaged inside the app (about 140 MB instead of 500 MB)",
      "Collapsed sidebar: text overlapped the icons; it now shows icons only and slides smoothly open and closed",
      "Timeline took about 10 seconds to open on busy days; finished sessions are now plain text and long days load only the latest rows first",
      "Import and export did not cover every record; verified now with a field-by-field round-trip test of all three formats",
      "WatchTower always opened in the tray after launch; it now opens in front unless Launch in the system tray is switched on",
    ],
    knownIssues: ["Windows builds are not code-signed; SmartScreen may warn on first launch."],
  },
  {
    version: "0.1.2",
    date: "2026-11-20",
    label: "Themes, motion and polish",
    features: [
      "Twelve hand-tuned themes (ten new soothing palettes) with a live preview picker",
      "Ten bundled font families that work offline (Inter, Manrope, Nunito, Poppins, DM Sans, Lora, JetBrains Mono, Segoe UI, System UI, Monospace)",
      "Rounded corners from 0 to 24 px applied to the whole floating app frame",
      "Command palette (Ctrl+K) to jump to pages, switch themes and toggle settings",
      "Daily screen-time goal with an animated progress bar",
      "Animation speed (calm / normal / snappy), shadow depth, number roll-up and reset-appearance settings",
    ],
    improvements: [
      "Sliding navigation indicator, staggered card entrances and tactile hover/press motion everywhere",
      "Numbers roll up smoothly when they appear or change",
      "Smooth cross-fade when switching themes",
    ],
    fixes: [],
    knownIssues: ["Windows builds are not code-signed; SmartScreen may warn on first launch."],
  },
  {
    version: "0.1.1",
    date: "2026-11-19",
    label: "Windows startup repair",
    features: [
      "Persistent startup, server and agent diagnostic logs under %APPDATA%\Chronos\logs",
      "Structured /api/health readiness check (server, database, schema, data directory)",
      "Startup errors now name the real cause and offer to open the log folder",
    ],
    improvements: [
      "Local server and database are shut down gracefully so the embedded database is always flushed",
      "Monitoring agent is verified by a real heartbeat before Chronos reports monitoring as active",
      "Second launches no longer start a duplicate server",
    ],
    fixes: [
      "Packaged app failed with \"Chronos local server stopped before it became ready\": the server's node_modules folder was missing from the installer and portable build",
    ],
    knownIssues: [
      "Windows builds are not code-signed; SmartScreen may warn on first launch.",
      "Daylight-saving transition days may be off by up to one hour in hourly slices.",
    ],
  },
  {
    version: "0.1.0-dev",
    date: "2026-11-19",
    label: "Initial development version",
    features: [
      "Transition-based session engine with heartbeats, crash recovery and single-open-session guarantee",
      "Windows foreground monitor agent (PowerShell + Win32 APIs): foreground app, desktop shell, idle, lock state, elevation limits",
      "Chronos self-usage tracking (UI focus based, deduplicated against the agent)",
      "Overview, Statistics, Heat Map, Applications, Sessions, Timeline and Achievements pages",
      "JSON / Markdown / TXT export, validated JSON import with preview, merge and replace",
      "Automatic and manual backups with atomic writes, verification, history and restore",
      "Dark and light themes, accent colors, performance modes and reduced-motion support",
    ],
    improvements: [
      "Hour-exact slicing keeps midnight boundaries correct in all statistics",
      "Averages state their denominators (usage days vs calendar days)",
    ],
    fixes: [],
    knownIssues: [
      "This development build includes an Electron Windows desktop host and embedded PGlite database, but the Windows installer still requires a Windows build runner.",
      "The monitoring agent has not yet been exercised on the target Windows PC; validate process detection, idle transitions, and sleep/resume behavior before relying on long-term records.",
      "Monitoring runs while Chronos is open; a separate always-on Windows service is not included.",
      "UAC secure desktops and protected processes may limit the process metadata Windows exposes.",
      "Daylight-saving transition days may be off by up to one hour in hourly slices.",
    ],
  },
];
