"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Database, Settings as SettingsIcon, Boxes, LogOut } from "lucide-react";
import { THEME_KEY, isThemeId } from "@/lib/theme";
import type { AppRole } from "@/lib/auth";
import { AppRoleContext } from "./auth-context";

const NAV = [
  { href: "/", label: "Execution Report", icon: LayoutDashboard },
  { href: "/new-job", label: "NGA TestRun Data", icon: Database, adminOnly: true },
  { href: "/settings", label: "Settings", icon: SettingsIcon, adminOnly: true },
];

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
    </AppRoleContext.Provider>
  );
}
