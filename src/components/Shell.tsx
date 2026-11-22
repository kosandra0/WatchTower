"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, AppWindow, BarChart3, FileText, FolderKanban, Gauge, History, LayoutDashboard, List, PanelLeftClose, PanelLeftOpen, ScrollText, Settings, Target, Timer, Trophy } from "lucide-react";
import { APP_NAME, NAV } from "@/lib/settings-shared";
import { APP_VERSION } from "@/lib/changelog";
import { getDesktop } from "@/lib/desktop";
import { fireEvent } from "@/lib/events";
import { useLive, useSettings } from "./Providers";
import { ChangelogModal } from "./Changelog";
import { CommandPalette } from "./CommandPalette";
import { Logo3D } from "./Logo3D";
import { TitleBar } from "./TitleBar";

/** Icon per NAV entry; also used by the tray quick panel so both menus always match. */
export const NAV_ICONS = {
  overview: LayoutDashboard,
  statistics: BarChart3,
  applications: AppWindow,
  sessions: List,
  timeline: History,
  focus: Timer,
  limits: Gauge,
  productivity: Target,
  projects: FolderKanban,
  reports: FileText,
  achievements: Trophy,
  settings: Settings,
} as const;
const ICONS = NAV_ICONS;

/** Brand mark (live 3D watchtower). */
export function Logo({ size = 30 }: { size?: number }) {
  return <Logo3D size={size} />;
}

const PAGE_EVENTS: Record<string, string> = { "/timeline": "explore_timeline", "/sessions": "explore_sessions", "/achievements": "explore_achievements", "/applications": "explore_applist" };

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { settings, ready, update, motion: m } = useSettings();
  const { data, error } = useLive();
  const [logOpen, setLogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const collapsed = settings.sidebarCollapsed;
  const isTray = pathname === "/tray";

  useEffect(() => {
    if (isTray) {
      document.documentElement.dataset.tray = "true";
      document.title = APP_NAME;
      return;
    }
    const item = [...NAV].reverse().find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
    document.title = `${APP_NAME} · ${item?.label ?? "Overview"}`;
    const ev = Object.keys(PAGE_EVENTS).find((p) => pathname.startsWith(p));
    if (ev) fireEvent(PAGE_EVENTS[ev]);
  }, [pathname, isTray]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => {
          if (!o) fireEvent("open_palette");
          return !o;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Navigation requests from the tray quick panel.
  useEffect(() => getDesktop()?.onNavigate((p) => router.push(p)), [router]);

  // Default landing page (applied once per browser session).
  useEffect(() => {
    if (isTray || !ready || pathname !== "/" || settings.landing === "/") return;
    if (sessionStorage.getItem("chronos.landed")) return;
    sessionStorage.setItem("chronos.landed", "1");
    router.replace(settings.landing);
  }, [ready, pathname, settings.landing, router, isTray]);

  if (isTray) return <>{children}</>;

  const status = error && !data ? "off" : data?.status === "tracking" ? "live" : data?.status === "paused" ? "off" : "warn";
  const statusText = error && !data ? "Engine unreachable" : data?.status === "tracking" ? "Monitoring active" : data?.status === "paused" ? "Monitoring paused" : "Waiting for monitor";

  return (
    <div className="app-frame">
      <TitleBar />
      <div className="shell">
        <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
          <div className="brand">
            <Logo3D size={36} animate={m.page} variant={settings.logo} />
            <span className="brand-name">{APP_NAME}</span>
          </div>
          <nav className="flex flex-col gap-1" aria-label="Main">
            {NAV.map((n) => {
              const Icon = ICONS[n.icon as keyof typeof ICONS];
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={`nav-item ${active ? "active" : ""}`} data-tip={n.label} aria-current={active ? "page" : undefined}>
                  {active && (
                    <>
                      <motion.span layoutId="nav-bg" className="nav-bg" transition={{ type: "spring", stiffness: 420, damping: 36 }} />
                      <motion.span layoutId="nav-bar" className="nav-bar" transition={{ type: "spring", stiffness: 420, damping: 36 }} />
                    </>
                  )}
                  <Icon size={18} />
                  <span className="label">{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <div style={{ flex: 1 }} />
          <button className="nav-item" data-tip="Search (Ctrl+K)" onClick={() => { fireEvent("open_palette"); setPaletteOpen(true); }}>
            <Search size={18} />
            <span className="label label-row">Quick search <span className="kbd">Ctrl K</span></span>
          </button>
          <button className="nav-item" data-tip="Update Logs" onClick={() => setLogOpen(true)}>
            <ScrollText size={18} />
            <span className="label">Update Logs</span>
          </button>
          <button className="nav-item" data-tip={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => update({ sidebarCollapsed: !collapsed })}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="label">Collapse</span>
          </button>
          <div className="nav-item tip" data-tip={`${statusText} · v${APP_VERSION}`} style={{ cursor: "default", height: "auto", padding: collapsed ? "10px 0" : "10px 12px", marginTop: 6 }}>
            <span className={`dot ${status}`} />
            <span className="label" style={{ fontSize: "0.82rem" }}>
              <span style={{ color: "var(--text)", display: "block" }}>{statusText}</span>
              <span className="faint">v{APP_VERSION}</span>
            </span>
          </div>
        </aside>
        <main className="main">
          <motion.div key={pathname} initial={m.page ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {children}
          </motion.div>
        </main>
        <ChangelogModal open={logOpen} onClose={() => setLogOpen(false)} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpenLogs={() => setLogOpen(true)} />
      </div>
    </div>
  );
}
