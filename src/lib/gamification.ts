import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { achievements } from "@/db/schema";
import { getKV, getTz, setKV } from "./settings";

export type AchievementDef = { id: string; title: string; description: string; xp: number };

// Finite, milestone-based XP. Leaving the computer running never produces unlimited XP.
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_session", title: "First Session", description: "Record your first activity session.", xp: 50 },
  { id: "first_full_day", title: "A Full Day", description: "Record at least 6 hours of activity in a single day.", xp: 100 },
  { id: "seven_days", title: "Seven Days of Insight", description: "Use WatchTower on 7 different days.", xp: 150 },
  { id: "streak_3", title: "Steady Observer", description: "Track at least 30 minutes a day for 3 days in a row.", xp: 100 },
  { id: "streak_14", title: "Consistent Tracker", description: "Track at least 30 minutes a day for 14 days in a row.", xp: 250 },
  { id: "apps_10", title: "Wide Horizons", description: "Observe 10 different applications.", xp: 75 },
  { id: "sessions_100", title: "Hundred Sessions", description: "Record 100 activity sessions.", xp: 60 },
  { id: "hours_10", title: "Ten Hours Recorded", description: "Accumulate 10 hours of active time.", xp: 80 },
  { id: "hours_100", title: "Hundred Hours Recorded", description: "Accumulate 100 hours of active time.", xp: 300 },
  { id: "explore_apps", title: "Application Explorer", description: "Open an application's detail page.", xp: 40 },
  { id: "review_weekly", title: "Weekly Review", description: "Review your statistics for This Week.", xp: 40 },
  { id: "explore_heatmap", title: "Pattern Seeker", description: "Explore the activity heat map.", xp: 30 },
  { id: "first_backup", title: "Safety Net", description: "Create your first verified backup.", xp: 40 },
  // sessions
  { id: "sessions_10", title: "Getting Started", description: "Record 10 activity sessions.", xp: 20 },
  { id: "sessions_500", title: "Five Hundred Strong", description: "Record 500 activity sessions.", xp: 90 },
  { id: "sessions_1000", title: "Thousand Moments", description: "Record 1,000 activity sessions.", xp: 150 },
  { id: "sessions_5000", title: "Relentless Observer", description: "Record 5,000 activity sessions.", xp: 300 },
  // hours
  { id: "hours_1", title: "First Hour", description: "Accumulate 1 hour of active time.", xp: 25 },
  { id: "hours_5", title: "Five Hours Recorded", description: "Accumulate 5 hours of active time.", xp: 50 },
  { id: "hours_25", title: "Twenty-Five Hours", description: "Accumulate 25 hours of active time.", xp: 120 },
  { id: "hours_50", title: "Half a Hundred", description: "Accumulate 50 hours of active time.", xp: 180 },
  { id: "hours_250", title: "Two Hundred and Fifty", description: "Accumulate 250 hours of active time.", xp: 400 },
  { id: "hours_500", title: "Five Hundred Hours", description: "Accumulate 500 hours of active time.", xp: 600 },
  // days
  { id: "days_3", title: "Three Days In", description: "Use WatchTower on 3 different days.", xp: 40 },
  { id: "days_14", title: "Fortnight of Focus", description: "Use WatchTower on 14 different days.", xp: 120 },
  { id: "days_30", title: "A Month Together", description: "Use WatchTower on 30 different days.", xp: 250 },
  { id: "days_100", title: "Hundred Days", description: "Use WatchTower on 100 different days.", xp: 500 },
  { id: "days_365", title: "A Full Year", description: "Use WatchTower on 365 different days.", xp: 1000 },
  { id: "streak_7", title: "Week Streak", description: "Track at least 30 minutes a day for 7 days in a row.", xp: 160 },
  { id: "streak_30", title: "Unbreakable Month", description: "Track at least 30 minutes a day for 30 days in a row.", xp: 500 },
  // single-day totals
  { id: "day_1h", title: "Warm-up", description: "Record at least 1 hour in a single day.", xp: 30 },
  { id: "day_3h", title: "Steady Day", description: "Record at least 3 hours in a single day.", xp: 50 },
  { id: "day_10h", title: "Marathon Day", description: "Record at least 10 hours in a single day.", xp: 200 },
  // applications
  { id: "apps_5", title: "Curious Mind", description: "Observe 5 different applications.", xp: 40 },
  { id: "apps_25", title: "App Collector", description: "Observe 25 different applications.", xp: 120 },
  { id: "apps_50", title: "App Connoisseur", description: "Observe 50 different applications.", xp: 250 },
  // single sessions
  { id: "long_1h", title: "Deep Focus", description: "Stay in one application for an hour without switching.", xp: 80 },
  { id: "long_3h", title: "Flow State", description: "Stay in one application for 3 hours without switching.", xp: 200 },
  // time of day
  { id: "night_owl", title: "Night Owl", description: "Start a session between midnight and 5 AM.", xp: 40 },
  { id: "early_bird", title: "Early Bird", description: "Start a session between 5 AM and 8 AM.", xp: 40 },
  { id: "weekend", title: "Weekend Warrior", description: "Record activity on a Saturday or Sunday.", xp: 30 },
  // variety and rest
  { id: "cats_3", title: "Well Rounded", description: "Use applications from 3 different categories.", xp: 50 },
  { id: "cats_6", title: "Renaissance", description: "Use applications from 6 different categories.", xp: 120 },
  { id: "idle_first", title: "Taking a Breath", description: "Record your first idle period.", xp: 20 },
  { id: "idle_25", title: "Mindful Breaks", description: "Record 25 idle periods.", xp: 80 },
  // exploring and personalising
  { id: "explore_timeline", title: "Time Traveller", description: "Open the activity timeline.", xp: 30 },
  { id: "explore_sessions", title: "History Buff", description: "Browse your session history.", xp: 30 },
  { id: "explore_achievements", title: "Trophy Room", description: "Visit the achievements page.", xp: 20 },
  { id: "explore_applist", title: "App Inspector", description: "Open the applications list.", xp: 20 },
  { id: "change_theme", title: "Mood Setter", description: "Change the theme.", xp: 30 },
  { id: "set_name", title: "Hello There", description: "Tell WatchTower your name.", xp: 30 },
  { id: "title_bar", title: "Window Dresser", description: "Choose a different title bar style.", xp: 30 },
  { id: "round_corners", title: "Smooth Operator", description: "Adjust the rounded corners.", xp: 30 },
  { id: "open_palette", title: "Power User", description: "Open the command palette with Ctrl+K.", xp: 40 },
  { id: "set_goal", title: "Goal Setter", description: "Set your daily screen-time goal.", xp: 40 },
  { id: "export_data", title: "Data Keeper", description: "Export your data.", xp: 40 },
  { id: "import_data", title: "Welcome Back", description: "Import data from a file.", xp: 40 },
];

export const EVENT_ACHIEVEMENTS = [
  "explore_apps", "review_weekly", "explore_heatmap", "explore_timeline", "explore_sessions", "explore_achievements", "explore_applist",
  "change_theme", "set_name", "title_bar", "round_corners", "open_palette", "set_goal", "export_data", "import_data",
];

const LEVEL_NAMES = [
  "Digital Explorer",
  "Time Observer",
  "Usage Analyst",
  "Digital Strategist",
  "Tower Enthusiast",
  "Rhythm Keeper",
  "Focus Cartographer",
  "Habit Architect",
  "Temporal Scholar",
  "Tower Master",
];

export function xpForLevel(level: number) {
  // v2.1.0: levels come 2.25x faster than before (the old curve was 50 * L * (L - 1)); 200/9 = 50/2.25.
  // L1:0 L2:44 L3:133 L4:267 L5:444 L6:667 L7:933 L8:1244 L9:1600 L10:2000 ... XP awards are unchanged.
  return Math.round(((200 / 9) * level * (level - 1)));
}

export function levelFor(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    name: LEVEL_NAMES[level - 1] ?? `Tower Master ${level - LEVEL_NAMES.length + 1}`,
    xp,
    currentFloor: cur,
    nextAt: next,
    progress: (xp - cur) / (next - cur),
    toNext: next - xp,
  };
}

export async function recordEvent(name: string) {
  if (!EVENT_ACHIEVEMENTS.includes(name)) return false;
  if (!(await getKV(`event:${name}`))) await setKV(`event:${name}`, new Date().toISOString());
  return true;
}

async function metrics() {
  const tz = await getTz();
  const days = (
    await db.execute(sql`
      SELECT to_char(start_time AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
        SUM(CASE WHEN is_open THEN (extract(epoch from (now() - start_time)) * 1000)::bigint ELSE duration_ms END)::bigint AS ms
      FROM sessions WHERE activity_type IN ('app','desktop') GROUP BY 1 ORDER BY 1`)
  ).rows as unknown as { day: string; ms: string }[];
  const counts = (
    await db.execute(sql`SELECT
      (SELECT COUNT(*) FROM sessions)::int AS sessions,
      (SELECT COUNT(*) FROM sessions WHERE is_open = false)::int AS closed,
      (SELECT COUNT(DISTINCT application_id) FROM sessions WHERE activity_type = 'app')::int AS apps,
      (SELECT COUNT(*) FROM backup_history WHERE status = 'ok')::int AS backups`)
  ).rows[0] as unknown as { sessions: number; closed: number; apps: number; backups: number };
  const extra = (
    await db.execute(sql`SELECT
      COALESCE(MAX(CASE WHEN activity_type = 'app' AND is_open = false THEN duration_ms END), 0)::bigint AS longest,
      COUNT(*) FILTER (WHERE activity_type = 'idle')::int AS idle,
      COUNT(*) FILTER (WHERE activity_type IN ('app','desktop') AND extract(hour from start_time AT TIME ZONE ${tz}) < 5)::int AS night,
      COUNT(*) FILTER (WHERE activity_type IN ('app','desktop') AND extract(hour from start_time AT TIME ZONE ${tz}) BETWEEN 5 AND 7)::int AS early,
      COUNT(*) FILTER (WHERE activity_type IN ('app','desktop') AND extract(isodow from start_time AT TIME ZONE ${tz}) >= 6)::int AS weekend
      FROM sessions`)
  ).rows[0] as unknown as { longest: string; idle: number; night: number; early: number; weekend: number };
  const cats = (await db.execute(sql`SELECT COUNT(DISTINCT category)::int AS n FROM applications`)).rows[0] as unknown as { n: number };
  const dayMs = days.map((d) => ({ day: d.day, ms: Number(d.ms) }));
  const totalMs = dayMs.reduce((n, d) => n + d.ms, 0);
  // Longest streak of days with >= 30 minutes.
  let best = 0,
    run = 0,
    prev: number | null = null;
  for (const d of dayMs) {
    if (d.ms < 30 * 60_000) {
      run = 0;
      prev = null;
      continue;
    }
    const t = Date.parse(d.day + "T00:00:00Z");
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    prev = t;
    best = Math.max(best, run);
  }
  return {
    closedSessions: counts.closed,
    sessions: counts.sessions,
    apps: counts.apps,
    backups: counts.backups,
    usageDays: dayMs.filter((d) => d.ms > 0).length,
    maxDayMs: dayMs.reduce((n, d) => Math.max(n, d.ms), 0),
    totalMs,
    streak: best,
    longestMs: Number(extra.longest),
    idle: extra.idle,
    night: extra.night,
    early: extra.early,
    weekend: extra.weekend,
    categories: cats.n,
  };
}

export async function evaluate() {
  const m = await metrics();
  const events = await Promise.all(EVENT_ACHIEVEMENTS.map(async (e) => [e, !!(await getKV(`event:${e}`))] as const));
  const ev = Object.fromEntries(events);
  const ok: Record<string, boolean> = {
    first_session: m.closedSessions >= 1,
    first_full_day: m.maxDayMs >= 6 * 3600_000,
    seven_days: m.usageDays >= 7,
    streak_3: m.streak >= 3,
    streak_14: m.streak >= 14,
    apps_10: m.apps >= 10,
    sessions_100: m.sessions >= 100,
    hours_10: m.totalMs >= 10 * 3600_000,
    hours_100: m.totalMs >= 100 * 3600_000,
    explore_apps: ev.explore_apps,
    review_weekly: ev.review_weekly,
    explore_heatmap: ev.explore_heatmap,
    first_backup: m.backups >= 1,
    sessions_10: m.sessions >= 10, sessions_500: m.sessions >= 500, sessions_1000: m.sessions >= 1000, sessions_5000: m.sessions >= 5000,
    hours_1: m.totalMs >= 3600_000, hours_5: m.totalMs >= 5 * 3600_000, hours_25: m.totalMs >= 25 * 3600_000, hours_50: m.totalMs >= 50 * 3600_000,
    hours_250: m.totalMs >= 250 * 3600_000, hours_500: m.totalMs >= 500 * 3600_000,
    days_3: m.usageDays >= 3, days_14: m.usageDays >= 14, days_30: m.usageDays >= 30, days_100: m.usageDays >= 100, days_365: m.usageDays >= 365,
    streak_7: m.streak >= 7, streak_30: m.streak >= 30,
    day_1h: m.maxDayMs >= 3600_000, day_3h: m.maxDayMs >= 3 * 3600_000, day_10h: m.maxDayMs >= 10 * 3600_000,
    apps_5: m.apps >= 5, apps_25: m.apps >= 25, apps_50: m.apps >= 50,
    long_1h: m.longestMs >= 3600_000, long_3h: m.longestMs >= 3 * 3600_000,
    night_owl: m.night >= 1, early_bird: m.early >= 1, weekend: m.weekend >= 1,
    cats_3: m.categories >= 3, cats_6: m.categories >= 6,
    idle_first: m.idle >= 1, idle_25: m.idle >= 25,
    explore_timeline: ev.explore_timeline, explore_sessions: ev.explore_sessions, explore_achievements: ev.explore_achievements, explore_applist: ev.explore_applist,
    change_theme: ev.change_theme, set_name: ev.set_name, title_bar: ev.title_bar, round_corners: ev.round_corners,
    open_palette: ev.open_palette, set_goal: ev.set_goal, export_data: ev.export_data, import_data: ev.import_data,
  };
  const have = new Set((await db.select({ id: achievements.id }).from(achievements)).map((a) => a.id));
  for (const def of ACHIEVEMENTS) {
    if (ok[def.id] && !have.has(def.id)) {
      await db
        .insert(achievements)
        .values({ id: def.id, achievementType: def.id, unlockedAt: new Date(), xpAwarded: def.xp, seen: false })
        .onConflictDoNothing();
    }
  }
  return getProgress(m);
}

export async function getProgress(m?: Awaited<ReturnType<typeof metrics>>) {
  const metricsNow = m ?? (await metrics());
  const rows = await db.select().from(achievements).orderBy(sql`${achievements.unlockedAt} desc`);
  const xp = rows.reduce((n, r) => n + r.xpAwarded, 0);
  const unlocked = new Map(rows.map((r) => [r.id, r]));
  return {
    level: levelFor(xp),
    xp,
    achievements: ACHIEVEMENTS.map((a) => ({
      ...a,
      unlockedAt: unlocked.get(a.id)?.unlockedAt.toISOString() ?? null,
      seen: unlocked.get(a.id)?.seen ?? true,
    })),
    unseen: ACHIEVEMENTS.filter((a) => unlocked.has(a.id) && !unlocked.get(a.id)!.seen).map((a) => ({ id: a.id, title: a.title, xp: a.xp })),
    stats: metricsNow,
  };
}

export async function markSeen() {
  await db.update(achievements).set({ seen: true }).where(eq(achievements.seen, false));
}
