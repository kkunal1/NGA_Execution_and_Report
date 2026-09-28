"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Database, Settings as SettingsIcon, Boxes } from "lucide-react";
import { THEME_KEY, isThemeId } from "@/lib/theme";

const NAV = [
  { href: "/", label: "Execution Report", icon: LayoutDashboard },
  { href: "/new-job", label: "NGA TestRun Data", icon: Database },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const apply = () => {
      const stored = window.localStorage.getItem(THEME_KEY);
      document.documentElement.setAttribute("data-theme", isThemeId(stored) ? stored : "professional");
    };
    apply();
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) apply();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className="flex min-h-screen bg-[var(--page-bg)]">
      <aside className="flex w-64 shrink-0 flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-text)]">
        <div className="flex items-center gap-2 px-5 py-5 text-white">
          <Boxes className="h-6 w-6 text-sky-400" />
          <span className="text-lg font-semibold tracking-tight">NGA Portal</span>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-[var(--accent)] text-[var(--accent-text)] shadow-sm" : "text-[var(--sidebar-text)] hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs opacity-70">
          Local instance &middot; single-user
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3">
          <div className="text-sm font-medium text-[var(--text-muted)]">NGA Execution &amp; Report</div>
          <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
            {now && (
              <span>
                {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                {" · "}
                {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <span className="font-semibold text-[var(--text)]">intel</span>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
