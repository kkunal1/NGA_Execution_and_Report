"use client";

import { FormEvent, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Database, Settings as SettingsIcon, Boxes, LogOut, Clock3 } from "lucide-react";
import { THEME_KEY, isThemeId } from "@/lib/theme";
import type { AppRole } from "@/lib/auth";
import { AppRoleContext } from "./auth-context";
import { RefreshScheduleContext, type RefreshSchedule } from "./refresh-context";

const NAV = [
  { href: "/", label: "Execution Report", icon: LayoutDashboard },
  { href: "/new-job", label: "NGA TestRun Data", icon: Database, adminOnly: true },
  { href: "/settings", label: "Settings", icon: SettingsIcon, adminOnly: true },
];

function RefreshCountdown() {
  const refreshContext = useContext(RefreshScheduleContext);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const schedule = refreshContext?.schedule;
  if (!schedule) return null;
  const remaining = schedule.nextRefreshAt
    ? Math.max(0, Math.ceil((schedule.nextRefreshAt - now) / 1000))
    : null;
  const label = schedule.intervalSeconds === 0
    ? "Off"
    : remaining == null
      ? "Pending"
      : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <div role="timer" className="inline-flex items-center gap-2 rounded-md bg-[var(--surface-alt)] px-3 py-1.5 text-[var(--text)]" aria-label={remaining == null ? `Next refresh ${label.toLowerCase()}` : `Next refresh in ${label}`}>
      <Clock3 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
      <span className="text-xs text-[var(--text-muted)]">Next refresh</span>
      <span className="min-w-12 text-center text-lg font-bold tabular-nums">{label}</span>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<AppRole | null>(null);
  const [username, setUsername] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [adminConfigured, setAdminConfigured] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [refreshSchedule, setRefreshSchedule] = useState<RefreshSchedule>({ nextRefreshAt: null, intervalSeconds: 0 });
  const refreshContextValue = useMemo(
    () => ({ schedule: refreshSchedule, setSchedule: setRefreshSchedule }),
    [refreshSchedule],
  );

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const session = (await response.json()) as { role: AppRole | null; username: string | null; adminConfigured: boolean };
        setAdminConfigured(session.adminConfigured);
        setRole(session.role);
        setUsername(session.username ?? "");
      })
      .catch(() => setLoginError("Could not check your sign-in session."))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (role === "viewer" && (pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/new-job")) {
      router.replace("/");
    }
  }, [pathname, role, router]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const result = (await response.json()) as { role?: AppRole; username?: string; error?: string };
      if (!response.ok || !result.role) throw new Error(result.error || "Sign-in failed.");
      setRole(result.role);
      setUsername(result.username ?? loginUsername);
      setLoginPassword("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setLoginBusy(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setRole(null);
    setUsername("");
    setLoginPassword("");
  };

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!role) return;
    let cancelled = false;
    const applyTheme = (value: string | null) => {
      const selected = isThemeId(value) ? value : "professional";
      document.documentElement.setAttribute("data-theme", selected);
      window.localStorage.setItem(THEME_KEY, selected);
    };
    const syncTheme = async () => {
      try {
        const response = await fetch("/api/settings/theme", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { theme: string | null };
        if (data.theme) {
          applyTheme(data.theme);
        } else if (role === "admin") {
          const localTheme = window.localStorage.getItem(THEME_KEY);
          const initialTheme = isThemeId(localTheme) ? localTheme : "professional";
          const saveResponse = await fetch("/api/settings/theme", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme: initialTheme }),
          });
          if (!cancelled && saveResponse.ok) applyTheme(initialTheme);
        } else {
          applyTheme("professional");
        }
      } catch {
        if (!cancelled) applyTheme(window.localStorage.getItem(THEME_KEY));
      }
    };
    void syncTheme();
    const timer = window.setInterval(() => void syncTheme(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [role]);

  if (checkingSession) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-sm text-[var(--text-muted)]">Checking sign-in…</div>;
  }

  if (!role) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-4 py-8">
        <section className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600"><Boxes className="h-5 w-5" /></div>
            <div><h1 className="text-lg font-semibold text-[var(--text)]">NGA Portal</h1><p className="text-sm text-[var(--text-muted)]">Sign in to continue</p></div>
          </div>
          <form onSubmit={signIn} className="space-y-4">
            <label className="block text-sm font-medium text-[var(--text)]">
              Username
              <input autoComplete="username" value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" required />
            </label>
            <label className="block text-sm font-medium text-[var(--text)]">
              Password
              <input type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" required />
            </label>
            {loginError && <p role="alert" className="text-sm text-red-600">{loginError}</p>}
            <button type="submit" disabled={loginBusy} className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-text)] disabled:opacity-50">
              {loginBusy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <div className="mt-5 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
            <p>Read-only team access: username <strong>root</strong>, password <strong>root</strong>.</p>
            {!adminConfigured && <p className="mt-2 text-amber-700">Admin access is not configured. Set APP_ADMIN_USERNAME (not root) and APP_ADMIN_PASSWORD on the server.</p>}
          </div>
        </section>
      </main>
    );
  }

  if (role === "viewer" && (pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/new-job")) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-sm text-[var(--text-muted)]">Opening viewer dashboard…</div>;
  }

  return (
    <AppRoleContext.Provider value={role}>
    <RefreshScheduleContext.Provider value={refreshContextValue}>
    <div className="flex min-h-screen bg-[var(--page-bg)]">
      <aside className="flex w-64 shrink-0 flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-text)]">
        <div className="flex items-center gap-2 px-5 py-5 text-white">
          <Boxes className="h-6 w-6 text-sky-400" />
          <span className="text-lg font-semibold tracking-tight">NGA Portal</span>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.filter((item) => !item.adminOnly || role === "admin").map(({ href, label, icon: Icon }) => {
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
          {role === "admin" ? "Administrator" : "Read-only viewer"}
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
            <RefreshCountdown />
            <span className="font-semibold text-[var(--text)]">intel</span>
            <span className="text-xs">{username}</span>
            <button type="button" onClick={() => void signOut()} title="Sign out" aria-label="Sign out" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--surface-alt)]">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
    </RefreshScheduleContext.Provider>
    </AppRoleContext.Provider>
  );
}
