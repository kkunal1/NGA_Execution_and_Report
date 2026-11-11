"use client";

import { useEffect, useRef, useState } from "react";
import { Info, SunMoon } from "lucide-react";
import { DATA_PROVIDERS, DATA_PROVIDER_KEY, NGAI_PROXY_KEY, NGAI_VPN_KEY, type DataProvider } from "@/lib/provider";
import { THEMES, THEME_KEY, isThemeId, type ThemeId } from "@/lib/theme";
import WeeklyReportMailPanel from "@/components/WeeklyReportMailPanel";
import { DEFAULT_WEEKLY_REPORT_SECTIONS, type WeeklyReportSectionSettings } from "@/lib/weekly-report-visibility";

const THEME_OPTIONS = Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][];
const WEEKLY_REPORT_SECTION_OPTIONS: [keyof WeeklyReportSectionSettings, string][] = [
  ["cpuAllocation", "DMR System Allocation Across Teams"],
  ["hsdFailureSummary", "HSDs with 5 or More Failed Runs"],
  ["domainWise", "Domain-wise data"],
  ["overallFailureBreakdown", "Overall Validation group-wise failure breakdown"],
  ["openHsdesIssues", "Open HSDES Issues by Domain"],
];

type NgaiTokenStatus = {
  encryptionConfigured: boolean;
  tokenConfigured: boolean;
  source: "settings" | "environment" | "none";
};

type GraphMailForm = {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  senderEmail: string;
  recipientEmail: string;
  sendAt: string;
  timeZone: string;
  clientSecretConfigured: boolean;
  lastSentAt: string | null;
  lastError: string | null;
};

type DashboardSettings = {
  showManualAborts: boolean;
  poolSystems: boolean;
  weeklyReport: boolean;
  weeklyReportUpdate: boolean;
  weeklyReportEmail: boolean;
  weeklyReportHsdDetails: boolean;
  weeklyReportSections: WeeklyReportSectionSettings;
  weeklyReportMode: "dateRange" | "workWeek";
  executionTime: boolean;
  ngaiTestRunData: boolean;
};

type LoginAuditEntry = {
  username: string;
  role: "admin" | "viewer";
  loggedInAt: string;
  ipAddress: string;
  systemName: string;
  userAgent: string;
};

type AdminUserSummary = { username: string; createdAt: string };

export default function SettingsPage() {
  const [provider, setProvider] = useState<DataProvider>("ngai");
  const [saved, setSaved] = useState(false);
  const [vpnConnected, setVpnConnected] = useState(true);
  const [proxyUrl, setProxyUrl] = useState("");
  const [networkSaved, setNetworkSaved] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("professional");
  const [themeSaved, setThemeSaved] = useState(false);
  const [themeError, setThemeError] = useState("");
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const themePickerRef = useRef<HTMLDivElement>(null);
  const [ngaiToken, setNgaiToken] = useState("");
  const [ngaiTokenStatus, setNgaiTokenStatus] = useState<NgaiTokenStatus | null>(null);
  const [ngaiTokenMessage, setNgaiTokenMessage] = useState("");
  const [ngaiTokenError, setNgaiTokenError] = useState("");
  const [ngaiTokenBusy, setNgaiTokenBusy] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState("60");
  const [refreshSaved, setRefreshSaved] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [poolNames, setPoolNames] = useState("");
  const [poolSettingsLoading, setPoolSettingsLoading] = useState(true);
  const [poolSettingsBusy, setPoolSettingsBusy] = useState(false);
  const [poolSettingsSaved, setPoolSettingsSaved] = useState(false);
  const [poolSettingsError, setPoolSettingsError] = useState("");
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>({
    showManualAborts: false,
    poolSystems: false,
    weeklyReport: false,
    weeklyReportUpdate: false,
    weeklyReportEmail: false,
    weeklyReportHsdDetails: false,
    weeklyReportSections: DEFAULT_WEEKLY_REPORT_SECTIONS,
    weeklyReportMode: "dateRange",
    executionTime: false,
    ngaiTestRunData: false,
  });
  const [dashboardSettingsSaved, setDashboardSettingsSaved] = useState(false);
  const [dashboardSettingsError, setDashboardSettingsError] = useState("");
  const [loginAudit, setLoginAudit] = useState<LoginAuditEntry[]>([]);
  const [loginAuditError, setLoginAuditError] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([]);
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [adminUsersBusy, setAdminUsersBusy] = useState(false);
  const [adminUsersMessage, setAdminUsersMessage] = useState("");
  const [adminUsersError, setAdminUsersError] = useState("");
  const [graphMail, setGraphMail] = useState<GraphMailForm>({
    enabled: false,
    tenantId: "",
    clientId: "",
    senderEmail: "",
    recipientEmail: "",
    sendAt: "09:00",
    timeZone: "UTC",
    clientSecretConfigured: false,
    lastSentAt: null,
    lastError: null,
  });
  const [clientSecret, setClientSecret] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [mailMessage, setMailMessage] = useState("");
  const [mailError, setMailError] = useState("");

  useEffect(() => {
    if (!themePickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !themePickerRef.current?.contains(event.target)) {
        setThemePickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setThemePickerOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [themePickerOpen]);

  useEffect(() => {
    const stored = window.localStorage.getItem(DATA_PROVIDER_KEY);
    if (stored === "sso" || stored === "ngai") setProvider(stored);
    const storedVpn = window.localStorage.getItem(NGAI_VPN_KEY);
    if (storedVpn === "true" || storedVpn === "false") setVpnConnected(storedVpn === "true");
    setProxyUrl(window.localStorage.getItem(NGAI_PROXY_KEY) ?? "");
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    if (isThemeId(storedTheme)) setTheme(storedTheme);
    void fetch("/api/settings/theme", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { theme?: ThemeId | null; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load shared theme.");
        const sharedTheme = data.theme;
        if (typeof sharedTheme === "string" && isThemeId(sharedTheme)) setTheme(sharedTheme);
      })
      .catch((error: unknown) => setThemeError(error instanceof Error ? error.message : "Could not load shared theme."));
    void fetch("/api/settings/ngai-token", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as NgaiTokenStatus & { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load NGAi token status.");
        setNgaiTokenStatus(data);
      })
      .catch((error: unknown) => {
        setNgaiTokenError(error instanceof Error ? error.message : "Could not load NGAi token status.");
      });
    void fetch("/api/settings/refresh", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { intervalSeconds?: number; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load refresh settings.");
        setRefreshInterval(String(data.intervalSeconds ?? 60));
      })
      .catch((error: unknown) => setRefreshError(error instanceof Error ? error.message : "Could not load refresh settings."));
    void fetch("/api/settings/pool-systems", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { poolNames?: string[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load pool system settings.");
        setPoolNames((data.poolNames ?? []).join("\n"));
      })
      .catch((error: unknown) => setPoolSettingsError(error instanceof Error ? error.message : "Could not load pool system settings."))
      .finally(() => setPoolSettingsLoading(false));
    void fetch("/api/settings/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as DashboardSettings & { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load dashboard settings.");
        setDashboardSettings({
          showManualAborts: data.showManualAborts === true,
          poolSystems: data.poolSystems,
          weeklyReport: data.weeklyReport === true,
          weeklyReportUpdate: data.weeklyReportUpdate === true,
          weeklyReportEmail: data.weeklyReportEmail === true,
          weeklyReportHsdDetails: data.weeklyReportHsdDetails === true,
          weeklyReportSections: data.weeklyReportSections ?? DEFAULT_WEEKLY_REPORT_SECTIONS,
          weeklyReportMode: data.weeklyReportMode === "workWeek" ? "workWeek" : "dateRange",
          executionTime: data.executionTime,
          ngaiTestRunData: data.ngaiTestRunData,
        });
      })
      .catch((error: unknown) => setDashboardSettingsError(error instanceof Error ? error.message : "Could not load dashboard settings."));
    void fetch("/api/settings/login-audit", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { entries?: LoginAuditEntry[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load login audit.");
        setLoginAudit(data.entries ?? []);
      })
      .catch((error: unknown) => setLoginAuditError(error instanceof Error ? error.message : "Could not load login audit."));
    void fetch("/api/settings/admin-users", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { admins?: AdminUserSummary[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load admin users.");
        setAdminUsers(data.admins ?? []);
      })
      .catch((error: unknown) => setAdminUsersError(error instanceof Error ? error.message : "Could not load admin users."));
    void fetch("/api/settings/mail", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as Partial<GraphMailForm> & { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load Graph mail settings.");
        setGraphMail((current) => ({
          ...current,
          ...data,
          timeZone: data.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || current.timeZone,
        }));
      })
      .catch((error: unknown) => setMailError(error instanceof Error ? error.message : "Could not load Graph mail settings."));
  }, []);

  const save = (value: DataProvider) => {
    setProvider(value);
    window.localStorage.setItem(DATA_PROVIDER_KEY, value);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const saveNetwork = () => {
    window.localStorage.setItem(NGAI_VPN_KEY, String(vpnConnected));
    window.localStorage.setItem(NGAI_PROXY_KEY, proxyUrl.trim());
    setNetworkSaved(true);
    window.setTimeout(() => setNetworkSaved(false), 1800);
  };

  const saveNgaiToken = async () => {
    setNgaiTokenBusy(true);
    setNgaiTokenError("");
    setNgaiTokenMessage("");
    try {
      const response = await fetch("/api/settings/ngai-token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ngaiToken }),
      });
      const data = (await response.json()) as NgaiTokenStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save NGAi token.");
      setNgaiTokenStatus(data);
      setNgaiToken("");
      setNgaiTokenMessage("Encrypted NGAi token saved.");
    } catch (error) {
      setNgaiTokenError(error instanceof Error ? error.message : "Could not save NGAi token.");
    } finally {
      setNgaiTokenBusy(false);
    }
  };

  const removeNgaiToken = async () => {
    setNgaiTokenBusy(true);
    setNgaiTokenError("");
    setNgaiTokenMessage("");
    try {
      const response = await fetch("/api/settings/ngai-token", { method: "DELETE" });
      const data = (await response.json()) as NgaiTokenStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not remove saved NGAi token.");
      setNgaiTokenStatus(data);
      setNgaiTokenMessage("Saved NGAi token removed.");
    } catch (error) {
      setNgaiTokenError(error instanceof Error ? error.message : "Could not remove saved NGAi token.");
    } finally {
      setNgaiTokenBusy(false);
    }
  };

  const saveRefreshSettings = async () => {
    setRefreshError("");
    setRefreshSaved(false);
    const intervalSeconds = Number(refreshInterval);
    if (!Number.isInteger(intervalSeconds) || (intervalSeconds !== 0 && (intervalSeconds < 15 || intervalSeconds > 3600))) {
      setRefreshError("Enter 0 to disable refresh, or a whole number from 15 to 3600 seconds.");
      return;
    }
    try {
      const response = await fetch("/api/settings/refresh", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalSeconds }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save refresh settings.");
      setRefreshSaved(true);
      window.setTimeout(() => setRefreshSaved(false), 2500);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not save refresh settings.");
    }
  };

  const savePoolSettings = async () => {
    setPoolSettingsBusy(true);
    setPoolSettingsSaved(false);
    setPoolSettingsError("");
    try {
      const response = await fetch("/api/settings/pool-systems", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolNames: poolNames.split(/[,\r\n]+/).map((name) => name.trim()).filter(Boolean) }),
      });
      const data = (await response.json()) as { poolNames?: string[]; error?: string };
      if (!response.ok || !data.poolNames) throw new Error(data.error || "Could not save pool system settings.");
      setPoolNames(data.poolNames.join("\n"));
      setPoolSettingsSaved(true);
    } catch (error) {
      setPoolSettingsError(error instanceof Error ? error.message : "Could not save pool system settings.");
    } finally {
      setPoolSettingsBusy(false);
    }
  };

  const updateGraphMail = <Key extends keyof GraphMailForm>(key: Key, value: GraphMailForm[Key]) => {
    setGraphMail((current) => ({ ...current, [key]: value }));
  };

  const saveGraphMailSettings = async () => {
    setMailBusy(true);
    setMailError("");
    setMailMessage("");
    try {
      const response = await fetch("/api/settings/mail", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: graphMail.enabled,
          tenantId: graphMail.tenantId,
          clientId: graphMail.clientId,
          senderEmail: graphMail.senderEmail,
          recipientEmail: graphMail.recipientEmail,
          sendAt: graphMail.sendAt,
          timeZone: graphMail.timeZone,
          clientSecret,
        }),
      });
      const data = (await response.json()) as GraphMailForm & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save Graph mail settings.");
      setGraphMail(data);
      setClientSecret("");
      setMailMessage("Graph mail settings saved. Client secret is encrypted on this server.");
    } catch (error) {
      setMailError(error instanceof Error ? error.message : "Could not save Graph mail settings.");
    } finally {
      setMailBusy(false);
    }
  };

  const sendTestMail = async () => {
    setMailBusy(true);
    setMailError("");
    setMailMessage("");
    try {
      const response = await fetch("/api/settings/mail/test", { method: "POST" });
      const data = (await response.json()) as { error?: string; sentTo?: string; filename?: string };
      if (!response.ok) throw new Error(data.error || "Test email failed.");
      setMailMessage(`Test report sent to ${data.sentTo}. Attachment: ${data.filename}`);
    } catch (error) {
      setMailError(error instanceof Error ? error.message : "Test email failed.");
    } finally {
      setMailBusy(false);
    }
  };

  const saveTheme = async (value: ThemeId) => {
    setTheme(value);
    window.localStorage.setItem(THEME_KEY, value);
    document.documentElement.setAttribute("data-theme", value);
    setThemeError("");
    try {
      const response = await fetch("/api/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: value }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save shared theme.");
      setThemeSaved(true);
      window.setTimeout(() => setThemeSaved(false), 1800);
    } catch (error) {
      setThemeError(error instanceof Error ? error.message : "Could not save shared theme.");
    }
  };

  const saveDashboardSettings = async (next: DashboardSettings) => {
    setDashboardSettings(next);
    setDashboardSettingsError("");
    try {
      const response = await fetch("/api/settings/dashboard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = (await response.json()) as DashboardSettings & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save dashboard settings.");
      setDashboardSettings(data);
      setDashboardSettingsSaved(true);
      window.setTimeout(() => setDashboardSettingsSaved(false), 1800);
    } catch (error) {
      setDashboardSettingsError(error instanceof Error ? error.message : "Could not save dashboard settings.");
    }
  };

  const addAdmin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminUsersBusy(true);
    setAdminUsersError("");
    setAdminUsersMessage("");
    try {
      const response = await fetch("/api/settings/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newAdminUsername, password: newAdminPassword }),
      });
      const data = (await response.json()) as { admin?: AdminUserSummary; error?: string };
      if (!response.ok || !data.admin) throw new Error(data.error || "Could not add admin.");
      setAdminUsers((current) => [...current, data.admin!].sort((a, b) => a.username.localeCompare(b.username)));
      setNewAdminUsername("");
      setNewAdminPassword("");
      setAdminUsersMessage(`Admin ${data.admin.username} added.`);
    } catch (error) {
      setAdminUsersError(error instanceof Error ? error.message : "Could not add admin.");
    } finally {
      setAdminUsersBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-5 px-5 py-6 lg:grid-cols-2">
      <header className="mb-1 flex items-start justify-between gap-4 border-b border-[var(--border)] pb-5 lg:col-span-2">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-muted)]">Administration / Workspace</p>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Settings</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Manage report content, data sources, delivery, and workspace access.</p>
        </div>
        <div ref={themePickerRef} className="relative shrink-0">
          <button
            type="button"
            aria-label="Choose theme"
            aria-haspopup="dialog"
            aria-controls="settings-theme-picker"
            aria-expanded={themePickerOpen}
            title="Choose theme"
            onClick={() => setThemePickerOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition hover:bg-[var(--surface-alt)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <SunMoon className="h-5 w-5" aria-hidden="true" />
          </button>
          {themePickerOpen && (
            <div id="settings-theme-picker" role="dialog" aria-label="Choose theme" className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2.5rem)] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
              <h2 className="text-sm font-semibold text-[var(--text)]">Theme</h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {THEME_OPTIONS.map(([id, tokens]) => (
                  <label key={id} className={`min-w-0 cursor-pointer rounded-md border p-2 transition ${theme === id ? "border-[var(--accent)] bg-[var(--surface-alt)]" : "border-[var(--border)] hover:border-slate-400"}`}>
                    <span className="flex min-h-9 items-start gap-1.5">
                      <input type="radio" name="settings-theme" value={id} checked={theme === id} onChange={() => void saveTheme(id)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]" />
                      <span className="text-xs font-medium leading-4 text-[var(--text)]">{tokens.label}</span>
                    </span>
                    <span className="mt-2 flex gap-1 pl-5">
                      <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: tokens.pageBg }} />
                      <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: tokens.sidebarBg }} />
                      <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: tokens.accent }} />
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--text-muted)]" role="status" aria-live="polite">
                {themeSaved ? "Shared theme saved." : `Current shared theme: ${THEMES[theme].label}`}
              </p>
              {themeError && <p className="mt-2 text-xs text-red-600" role="alert">{themeError}</p>}
            </div>
          )}
        </div>
      </header>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2" aria-labelledby="navigation-visibility-heading">
        <div className="mb-3">
          <h2 id="navigation-visibility-heading" className="text-base font-semibold text-[var(--text)]">Navigation Visibility</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Choose which workspace tools appear for viewers. Administrators retain access to all tools.</p>
        </div>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-alt)] text-xs font-semibold text-[var(--text-muted)]">
              <tr><th className="px-3 py-2.5">Workspace area</th><th className="px-3 py-2.5">Viewer access</th><th className="w-28 px-3 py-2.5 text-center">Visible</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              <tr><td className="px-3 py-2.5 font-medium text-[var(--text)]">Execution Report</td><td className="px-3 py-2.5 text-[var(--text-muted)]">Read only · always available</td><td className="px-3 py-2.5 text-center"><input type="checkbox" checked disabled aria-label="Execution Report is always visible" className="h-4 w-4 accent-[var(--accent)]" /></td></tr>
              {([
                ["poolSystems", "All Execution Systems", "Read only"],
                ["weeklyReport", "Daily/Weekly Report", "Read only"],
                ["weeklyReportUpdate", "Update Weekly Report", "Viewer access"],
                ["weeklyReportHsdDetails", "Update HSD Details", "Viewer access"],
                ["weeklyReportEmail", "Send Report Over Email", "Viewer access"],
                ["executionTime", "Check Execution Time", "Read only"],
                ["ngaiTestRunData", "NGA Test Run Data", "Admin only"],
              ] as const).map(([key, label, access]) => (
                <tr key={key}>
                  <td className="px-3 py-2.5 font-medium text-[var(--text)]">{label}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)]">{access}</td>
                  <td className="px-3 py-2.5 text-center"><input type="checkbox" role="switch" checked={dashboardSettings[key]} onChange={(event) => void saveDashboardSettings({ ...dashboardSettings, [key]: event.target.checked })} aria-label={`${label} visibility`} className="h-4 w-4 accent-[var(--accent)]" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">{dashboardSettingsSaved ? "Navigation visibility saved." : "Changes apply to all signed-in users."}</p>
      </section>
      <section className="h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby="execution-report-setting-heading">
        <h2 id="execution-report-setting-heading" className="text-base font-semibold text-[var(--text)]">Execution Report Setting</h2>
        <div className="mt-4 overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-alt)] text-xs font-semibold text-[var(--text-muted)]"><tr><th className="px-3 py-2.5">Setting</th><th className="px-3 py-2.5">Description</th><th className="w-24 px-3 py-2.5 text-center">Show</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]"><tr><td className="px-3 py-3 font-medium text-[var(--text)]">Show Aborted Manually in Aborted Tests</td><td className="px-3 py-3 text-sm text-[var(--text-muted)]">Include manual aborts in the table and total.</td><td className="px-3 py-3 text-center"><input type="checkbox" role="switch" checked={dashboardSettings.showManualAborts} onChange={(event) => void saveDashboardSettings({ ...dashboardSettings, showManualAborts: event.target.checked })} aria-label="Show aborted manually in aborted tests" className="h-4 w-4 accent-[var(--accent)]" /></td></tr></tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">{dashboardSettingsSaved ? "Execution Report setting saved." : dashboardSettings.showManualAborts ? "Manual aborts are shown." : "Manual aborts are hidden from the table and total."}</p>
        {dashboardSettingsError && <p className="mt-2 text-sm text-red-600" role="alert">{dashboardSettingsError}</p>}
      </section>
      <section className="h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby="add-admin-heading">
        <h2 id="add-admin-heading" className="text-base font-semibold text-[var(--text)]">Add Admin</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Create an additional administrator account. Passwords are stored as salted hashes, never as plain text. New accounts can sign in immediately.</p>
        <form onSubmit={addAdmin} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-[var(--text)]" htmlFor="new-admin-username">Username
            <input
              id="new-admin-username"
              required
              minLength={3}
              maxLength={128}
              pattern="[A-Za-z0-9][A-Za-z0-9._@+-]*"
              autoComplete="off"
              value={newAdminUsername}
              onChange={(event) => setNewAdminUsername(event.target.value)}
              disabled={adminUsersBusy}
              className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
            />
          </label>
          <label className="block text-sm font-medium text-[var(--text)]" htmlFor="new-admin-password">Password
            <input
              id="new-admin-password"
              required
              type="password"
              minLength={4}
              maxLength={256}
              autoComplete="new-password"
              value={newAdminPassword}
              onChange={(event) => setNewAdminPassword(event.target.value)}
              disabled={adminUsersBusy}
              className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={adminUsersBusy} className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-text)] disabled:opacity-60">
              {adminUsersBusy ? "Adding…" : "Add Admin"}
            </button>
            <p role="status" aria-live="polite" className={`text-sm ${adminUsersError ? "text-red-600" : "text-[var(--text-muted)]"}`}>
              {adminUsersError || adminUsersMessage}
            </p>
          </div>
        </form>
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">Additional admin accounts</h3>
          {adminUsers.length ? (
            <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
              {adminUsers.map((admin) => <li key={admin.username}>{admin.username} <span className="text-xs">(added {new Date(admin.createdAt).toLocaleDateString()})</span></li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-muted)]">No additional admin accounts have been added.</p>
          )}
        </div>
      </section>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2" aria-labelledby="weekly-report-settings-heading">
        <h2 id="weekly-report-settings-heading" className="text-base font-semibold text-[var(--text)]">Weekly Report Settings</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">The server generates the previous day&apos;s report at 12:05 AM IST and saves it centrally. Automatic reports use the B0 P1 and P2 suites.</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Choose which sections appear in manually created and automatically generated reports.</p>
        <div className="mt-4 overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-alt)] text-xs font-semibold text-[var(--text-muted)]"><tr><th className="px-3 py-2.5">Report section</th><th className="px-3 py-2.5">Visibility</th><th className="w-24 px-3 py-2.5 text-center">Include</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">{WEEKLY_REPORT_SECTION_OPTIONS.map(([key, label]) => <tr key={key}><td className="px-3 py-3 font-medium text-[var(--text)]">{label}</td><td className="px-3 py-3 text-[var(--text-muted)]">{dashboardSettings.weeklyReportSections[key] ? "Visible" : "Hidden"}</td><td className="px-3 py-3 text-center"><input type="checkbox" role="switch" checked={dashboardSettings.weeklyReportSections[key]} onChange={(event) => void saveDashboardSettings({ ...dashboardSettings, weeklyReportSections: { ...dashboardSettings.weeklyReportSections, [key]: event.target.checked } })} aria-label={`${label} included`} className="h-4 w-4 accent-[var(--accent)]" /></td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
          {dashboardSettingsSaved ? "Weekly Report section settings saved." : "Changes apply to loaded, generated, and emailed reports for all users."}
        </p>
        {dashboardSettingsError && <p className="mt-2 text-sm text-red-600" role="alert">{dashboardSettingsError}</p>}
      </section>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2" aria-labelledby="data-source-network-heading">
        <div className="mb-5">
          <h2 id="data-source-network-heading" className="text-base font-semibold text-[var(--text)]">Data source &amp; network</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Configure the execution data provider, NGAi token, and network route.</p>
        </div>
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Data provider</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DATA_PROVIDERS.map((option) => (
                <div key={option.value} className={`relative flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2 transition ${provider === option.value ? "border-[var(--accent)] bg-[var(--surface-alt)]" : "border-[var(--border)] hover:border-slate-400"}`}>
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text)]">
                    <input type="radio" name="provider" value={option.value} checked={provider === option.value} onChange={() => save(option.value)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
                    <span className="truncate">{option.label}</span>
                  </label>
                  <span className="group relative flex shrink-0">
                    <button type="button" aria-label={`${option.label} information`} className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--border)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                      <Info className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span role="tooltip" className="invisible pointer-events-none absolute right-0 top-full z-30 mt-2 w-64 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs font-normal leading-5 text-[var(--text)] opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">{option.description}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]" role="status" aria-live="polite">
              {saved ? "Provider saved." : `Current provider: ${provider === "sso" ? "Intel SSO" : "Intel NGAi"}`}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Intel NGAi API token</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Encrypted for this local app installation and never returned to this page.</p>
            <label className="mt-3 block text-xs font-semibold text-[var(--text-muted)]">
              Personal access token
              <input type="password" autoComplete="new-password" spellCheck={false} value={ngaiToken} onChange={(event) => setNgaiToken(event.target.value)} placeholder="Enter NGAi PAT" className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]" />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={saveNgaiToken} disabled={ngaiTokenBusy || !ngaiToken.trim() || !ngaiTokenStatus?.encryptionConfigured} className="h-9 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-50">Save encrypted token</button>
              {ngaiTokenStatus?.source === "settings" && <button type="button" onClick={removeNgaiToken} disabled={ngaiTokenBusy} className="h-9 rounded-md border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text)] disabled:opacity-50">Remove saved token</button>}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]" role="status" aria-live="polite">
              {ngaiTokenMessage || (ngaiTokenStatus?.source === "settings" ? "An encrypted token is saved in app settings." : ngaiTokenStatus?.source === "environment" ? "Using the legacy NGAI_API_TOKEN server environment setting." : ngaiTokenStatus?.source === "none" ? "No NGAi token is configured." : "Checking token configuration...")}
            </p>
            {!ngaiTokenStatus?.encryptionConfigured && <p className="mt-2 text-xs text-amber-700" role="alert">Encryption unavailable. Check local data directory and OS profile access.</p>}
            {ngaiTokenError && <p className="mt-2 text-xs text-red-600" role="alert">{ngaiTokenError}</p>}
          </div>

          <div className="lg:col-span-2 border-t border-[var(--border)] pt-5">
            <h3 className="text-sm font-semibold text-[var(--text)]">Intel NGAi network</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">VPN connection uses a direct route; turn it off to use the proxy below.</p>
            <div className="mt-3 grid gap-5 lg:grid-cols-2">
              <div className="flex flex-wrap items-start gap-2">
                <div className={`group relative inline-flex w-fit items-center gap-1 rounded-md border px-3 py-2 transition ${vpnConnected ? "border-[var(--accent)] bg-[var(--surface-alt)] text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
                  <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs font-medium">
                    <input type="radio" name="vpn" className="h-4 w-4 accent-[var(--accent)]" checked={vpnConnected} onChange={() => setVpnConnected(true)} />Connected · direct
                  </label>
                  <button type="button" aria-label="Connected via VPN information" className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--border)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><Info className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  <span role="tooltip" className="invisible pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs font-normal leading-5 text-[var(--text)] opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">When VPN is connected, NGAi requests use a direct network route.</span>
                </div>
                <div className={`group relative inline-flex w-fit items-center gap-1 rounded-md border px-3 py-2 transition ${!vpnConnected ? "border-[var(--accent)] bg-[var(--surface-alt)] text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
                  <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs font-medium">
                    <input type="radio" name="vpn" className="h-4 w-4 accent-[var(--accent)]" checked={!vpnConnected} onChange={() => setVpnConnected(false)} />Proxy
                  </label>
                  <button type="button" aria-label="Proxy routing information" className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--border)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><Info className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  <span role="tooltip" className="invisible pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs font-normal leading-5 text-[var(--text)] opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">When VPN is off, NGAi requests use the proxy URL configured alongside this option.</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)]">Proxy URL
                  <input type="text" value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="http://proxy-dmz.intel.com:912" className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]" />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={saveNetwork} className="h-9 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-text)]">Save network settings</button>
                  <p className="text-xs text-[var(--text-muted)]" role="status" aria-live="polite">{networkSaved ? "Network settings saved." : "Applies to future NGAi requests from this browser."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby="refresh-heading">
        <h2 id="refresh-heading" className="text-base font-semibold text-[var(--text)]">Automatic NGAi refresh</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Check the loaded suites for changes at this interval. Keep the admin dashboard open for automatic checks; connected viewers update when a new snapshot is saved. Set 0 to disable.
        </p>
        <label className="mt-4 block max-w-xs text-sm font-medium text-[var(--text)]">
          Refresh interval (seconds)
          <input
            type="number"
            min={0}
            max={3600}
            step={15}
            value={refreshInterval}
            onChange={(event) => setRefreshInterval(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void saveRefreshSettings()}
          className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)]"
        >
          Save refresh interval
        </button>
        <p className="mt-3 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
          {refreshSaved ? "Refresh interval saved." : `Current interval: ${refreshInterval || "0"} seconds`}
        </p>
        {refreshError && <p className="mt-2 text-sm text-red-600" role="alert">{refreshError}</p>}
      </section>

      <section className="h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby="pool-system-heading">
        <h2 id="pool-system-heading" className="text-base font-semibold text-[var(--text)]">Pool System Setting</h2>
        <label className="mt-4 block text-sm font-medium text-[var(--text)]" htmlFor="pool-system-names">Pool names
          <textarea
            id="pool-system-names"
            rows={3}
            value={poolNames}
            onChange={(event) => { setPoolNames(event.target.value); setPoolSettingsSaved(false); }}
            disabled={poolSettingsLoading || poolSettingsBusy}
            placeholder="pv_dmr-ap-ap1-b0"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </label>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Enter one pool per line, or separate names with commas.</p>
        <button type="button" onClick={() => void savePoolSettings()} disabled={poolSettingsLoading || poolSettingsBusy} className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] disabled:opacity-50">
          {poolSettingsBusy ? "Saving…" : "Save pools"}
        </button>
        {poolSettingsSaved && <p className="mt-3 text-sm text-[var(--text-muted)]" role="status">Pool system settings saved.</p>}
        {poolSettingsError && <p className="mt-2 text-sm text-red-600" role="alert">{poolSettingsError}</p>}
      </section>

      <div className="lg:col-span-2"><WeeklyReportMailPanel /></div>

      <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2" aria-labelledby="mail-heading">
        <summary id="mail-heading" className="cursor-pointer text-base font-semibold text-[var(--text)]">Advanced: scheduled Microsoft Graph email</summary>
        <div className="mt-4">
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Sends all configured suites as an HTML attachment daily at the selected local time. Requires an IT-approved Entra app with Microsoft Graph Mail.Send application permission and admin consent.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[var(--text)]">
              Tenant ID
              <input value={graphMail.tenantId} onChange={(event) => updateGraphMail("tenantId", event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" autoComplete="off" />
            </label>
            <label className="block text-sm font-medium text-[var(--text)]">
              App registration Client ID
              <input value={graphMail.clientId} onChange={(event) => updateGraphMail("clientId", event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" autoComplete="off" />
            </label>
            <label className="block text-sm font-medium text-[var(--text)]">
              Sender mailbox
              <input type="email" value={graphMail.senderEmail} onChange={(event) => updateGraphMail("senderEmail", event.target.value)} placeholder="nga-reports@intel.com" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-medium text-[var(--text)]">
              Recipient
              <input type="email" value={graphMail.recipientEmail} onChange={(event) => updateGraphMail("recipientEmail", event.target.value)} placeholder="abcd@intel.com" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-medium text-[var(--text)]">
              Daily send time
              <input type="time" value={graphMail.sendAt} onChange={(event) => updateGraphMail("sendAt", event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-medium text-[var(--text)]">
              Timezone (IANA)
              <input value={graphMail.timeZone} onChange={(event) => updateGraphMail("timeZone", event.target.value)} placeholder="Asia/Kolkata" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-medium text-[var(--text)] sm:col-span-2">
              Microsoft Graph client secret
              <input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={graphMail.clientSecretConfigured ? "Saved encrypted; leave blank to keep current secret" : "Enter client secret"} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text)]">
            <input type="checkbox" checked={graphMail.enabled} onChange={(event) => updateGraphMail("enabled", event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Enable daily scheduled email
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => void saveGraphMailSettings()} disabled={mailBusy} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] disabled:opacity-50">
              Save mail settings
            </button>
            <button type="button" onClick={() => void sendTestMail()} disabled={mailBusy || !graphMail.clientSecretConfigured} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] disabled:opacity-50">
              Send test email
            </button>
          </div>
          <p className="mt-3 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
            {mailMessage || (graphMail.enabled ? `Enabled · daily at ${graphMail.sendAt} (${graphMail.timeZone})` : "Scheduled email is disabled.")}
            {graphMail.lastSentAt && ` · Last sent ${new Date(graphMail.lastSentAt).toLocaleString()}`}
          </p>
          {(mailError || graphMail.lastError) && <p className="mt-2 text-sm text-red-600" role="alert">{mailError || graphMail.lastError}</p>}
        </div>
      </details>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2" aria-labelledby="login-audit-heading">
        <h2 id="login-audit-heading" className="text-base font-semibold text-[var(--text)]">User login audit</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Successful logins captured by this server. System name uses reverse DNS when available.</p>
        {loginAuditError && <p className="mt-3 text-sm text-red-600" role="alert">{loginAuditError}</p>}
        {!loginAuditError && loginAudit.length === 0 && <p className="mt-4 text-sm text-[var(--text-muted)]">No successful logins recorded yet.</p>}
        {loginAudit.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[var(--surface-alt)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Time</th>
                  <th className="px-3 py-2 font-semibold">User / role</th>
                  <th className="px-3 py-2 font-semibold">System name</th>
                  <th className="px-3 py-2 font-semibold">IP address</th>
                  <th className="px-3 py-2 font-semibold">Client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loginAudit.slice(0, 25).map((entry, index) => (
                  <tr key={`${entry.loggedInAt}-${entry.username}-${index}`}>
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--text-muted)]">{new Date(entry.loggedInAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-[var(--text)]">{entry.username} <span className="text-xs text-[var(--text-muted)]">({entry.role})</span></td>
                    <td className="px-3 py-2 text-[var(--text)]">{entry.systemName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--text-muted)]">{entry.ipAddress}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs text-[var(--text-muted)]" title={entry.userAgent}>{entry.userAgent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
