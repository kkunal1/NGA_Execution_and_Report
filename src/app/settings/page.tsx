"use client";

import { useEffect, useState } from "react";
import { DATA_PROVIDERS, DATA_PROVIDER_KEY, NGAI_PROXY_KEY, NGAI_VPN_KEY, type DataProvider } from "@/lib/provider";
import { THEMES, THEME_KEY, isThemeId, type ThemeId } from "@/lib/theme";

const THEME_OPTIONS = Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][];

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
  executionStatusSplit: boolean;
  rawStateValues: boolean;
  poolSystems: boolean;
  weeklyReport: boolean;
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

export default function SettingsPage() {
  const [provider, setProvider] = useState<DataProvider>("ngai");
  const [saved, setSaved] = useState(false);
  const [vpnConnected, setVpnConnected] = useState(true);
  const [proxyUrl, setProxyUrl] = useState("");
  const [networkSaved, setNetworkSaved] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("professional");
  const [themeSaved, setThemeSaved] = useState(false);
  const [themeError, setThemeError] = useState("");
  const [ngaiToken, setNgaiToken] = useState("");
  const [ngaiTokenStatus, setNgaiTokenStatus] = useState<NgaiTokenStatus | null>(null);
  const [ngaiTokenMessage, setNgaiTokenMessage] = useState("");
  const [ngaiTokenError, setNgaiTokenError] = useState("");
  const [ngaiTokenBusy, setNgaiTokenBusy] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState("60");
  const [refreshSaved, setRefreshSaved] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>({
    executionStatusSplit: true,
    rawStateValues: true,
    poolSystems: false,
    weeklyReport: false,
    weeklyReportMode: "dateRange",
    executionTime: false,
    ngaiTestRunData: false,
  });
  const [dashboardSettingsSaved, setDashboardSettingsSaved] = useState(false);
  const [dashboardSettingsError, setDashboardSettingsError] = useState("");
  const [loginAudit, setLoginAudit] = useState<LoginAuditEntry[]>([]);
  const [loginAuditError, setLoginAuditError] = useState("");
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
    void fetch("/api/settings/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as DashboardSettings & { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load dashboard settings.");
        setDashboardSettings({
          executionStatusSplit: data.executionStatusSplit,
          rawStateValues: data.rawStateValues,
          poolSystems: data.poolSystems,
          weeklyReport: data.weeklyReport === true,
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

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Choose which Intel data path the collection actions use.</p>
      </header>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="provider-heading">
        <h2 id="provider-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Data provider</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {DATA_PROVIDERS.map((option) => (
            <label key={option.value} className={`cursor-pointer rounded-lg border p-4 transition ${provider === option.value ? "border-[var(--accent)] bg-[var(--surface-alt)]" : "border-[var(--border)] hover:border-slate-400"}`}>
              <input
                type="radio"
                name="provider"
                value={option.value}
                checked={provider === option.value}
                onChange={() => save(option.value)}
                className="mr-3 accent-[var(--accent)]"
              />
              <span className="font-medium text-[var(--text)]">{option.label}</span>
              <p className="mt-2 pl-6 text-sm leading-6 text-[var(--text-muted)]">{option.description}</p>
            </label>
          ))}
        </div>
        <p className="mt-5 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
          {saved ? "Provider saved." : `Current provider: ${provider === "sso" ? "Intel SSO" : "Intel NGAi"}`}
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="ngai-token-heading">
        <h2 id="ngai-token-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Intel NGAi API token</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The token is encrypted for this local app installation and never returned to this page. Each OS user gets a separate encryption key in their home profile.
        </p>
        <label className="mt-4 block text-sm font-medium text-[var(--text)]">
          Personal access token
          <input
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={ngaiToken}
            onChange={(event) => setNgaiToken(event.target.value)}
            placeholder="Enter NGAi PAT"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveNgaiToken}
            disabled={ngaiTokenBusy || !ngaiToken.trim() || !ngaiTokenStatus?.encryptionConfigured}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save encrypted token
          </button>
          {ngaiTokenStatus?.source === "settings" && (
            <button
              type="button"
              onClick={removeNgaiToken}
              disabled={ngaiTokenBusy}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove saved token
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
          {ngaiTokenMessage || (ngaiTokenStatus?.source === "settings"
            ? "An encrypted token is saved in app settings."
            : ngaiTokenStatus?.source === "environment"
              ? "Using the legacy NGAI_API_TOKEN server environment setting."
              : ngaiTokenStatus?.source === "none"
                ? "No NGAi token is configured."
                : "Checking token configuration...")}
        </p>
        {!ngaiTokenStatus?.encryptionConfigured && (
          <p className="mt-2 text-sm text-amber-700" role="alert">
            Encryption is unavailable. Check that this app can write to its local data directory and your OS user profile.
          </p>
        )}
        {ngaiTokenError && <p className="mt-2 text-sm text-red-600" role="alert">{ngaiTokenError}</p>}
      </section>

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="refresh-heading">
        <h2 id="refresh-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Automatic NGAi refresh</h2>
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

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="dashboard-heading">
        <h2 id="dashboard-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Dashboard charts</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Chart toggles apply to all signed-in users. Menu visibility toggles apply to viewers; administrators always see the menus.</p>
        <div className="mt-4 space-y-3">
          {([
            ["executionStatusSplit", "Execution status split"],
            ["rawStateValues", "Raw state values"],
            ["poolSystems", "B0 Pool Systems menu"],
            ["weeklyReport", "Weekly Report menu (viewers only)"],
            ["executionTime", "Check Execution Time menu"],
            ["ngaiTestRunData", "NGA Test Run Data menu (admin only)"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm font-medium text-[var(--text)]">
              <span>{label}</span>
              <input
                type="checkbox"
                role="switch"
                checked={dashboardSettings[key]}
                onChange={(event) => void saveDashboardSettings({ ...dashboardSettings, [key]: event.target.checked })}
                className="h-5 w-5 accent-[var(--accent)]"
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
          {dashboardSettingsSaved ? "Dashboard chart settings saved." : "Changes apply to all signed-in users."}
        </p>
        {dashboardSettingsError && <p className="mt-2 text-sm text-red-600" role="alert">{dashboardSettingsError}</p>}
      </section>

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="weekly-report-settings-heading">
        <h2 id="weekly-report-settings-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Weekly Report Settings</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([[
            "dateRange", "Date Range",
          ], [
            "workWeek", "Work Week (WW)",
          ]] as const).map(([mode, label]) => (
            <label key={mode} className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm font-medium text-[var(--text)]">
              <span>{label}</span>
              <input
                type="checkbox"
                role="switch"
                checked={dashboardSettings.weeklyReportMode === mode}
                onChange={() => void saveDashboardSettings({ ...dashboardSettings, weeklyReportMode: mode })}
                className="h-5 w-5 accent-[var(--accent)]"
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
          {dashboardSettings.weeklyReportMode === "workWeek" ? "Work Week is active; Date Range is off." : "Date Range is active; Work Week is off."}
        </p>
        {dashboardSettingsError && <p className="mt-2 text-sm text-red-600" role="alert">{dashboardSettingsError}</p>}
      </section>

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="login-audit-heading">
        <h2 id="login-audit-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">User login audit</h2>
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
                {loginAudit.map((entry, index) => (
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

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="mail-heading">
        <h2 id="mail-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Scheduled Graph email</h2>
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
      </section>

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="network-heading">
        <h2 id="network-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Intel NGAi network</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Controls how NGAi requests reach Intel&apos;s server. When connected via VPN, requests go direct. When off VPN, they route through the proxy address below.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className={`cursor-pointer rounded-lg border p-4 transition ${vpnConnected ? "border-[var(--accent)] bg-[var(--surface-alt)]" : "border-[var(--border)] hover:border-slate-400"}`}>
            <input type="radio" name="vpn" className="mr-3 accent-[var(--accent)]" checked={vpnConnected} onChange={() => setVpnConnected(true)} />
            <span className="text-[var(--text)]">Connected via VPN (go direct)</span>
          </label>
          <label className={`cursor-pointer rounded-lg border p-4 transition ${!vpnConnected ? "border-[var(--accent)] bg-[var(--surface-alt)]" : "border-[var(--border)] hover:border-slate-400"}`}>
            <input type="radio" name="vpn" className="mr-3 accent-[var(--accent)]" checked={!vpnConnected} onChange={() => setVpnConnected(false)} />
            <span className="text-[var(--text)]">Not on VPN (use proxy)</span>
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium text-[var(--text)]">
          Proxy address (used when not on VPN)
          <input
            type="text"
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            placeholder="http://proxy-dmz.intel.com:912"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </label>
        <button
          type="button"
          onClick={saveNetwork}
          className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)]"
        >
          Save network settings
        </button>
        <p className="mt-3 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
          {networkSaved ? "Network settings saved." : "Applies to future NGAi requests from this browser."}
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="theme-heading">
        <h2 id="theme-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Theme</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Changes the page background, cards, tables, and charts across the whole app - and carries over into downloaded HTML reports.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map(([id, tokens]) => (
            <label
              key={id}
              className={`cursor-pointer rounded-lg border p-4 transition ${theme === id ? "border-[var(--accent)] bg-[var(--surface-alt)]" : "border-[var(--border)] hover:border-slate-400"}`}
            >
              <input
                type="radio"
                name="theme"
                value={id}
                checked={theme === id}
                onChange={() => saveTheme(id)}
                className="mr-3 accent-[var(--accent)]"
              />
              <span className="font-medium text-[var(--text)]">{tokens.label}</span>
              <div className="mt-3 flex gap-1.5 pl-6">
                <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: tokens.pageBg }} />
                <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: tokens.sidebarBg }} />
                <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: tokens.accent }} />
              </div>
            </label>
          ))}
        </div>
        <p className="mt-5 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
          {themeSaved ? "Shared theme saved." : `Current shared theme: ${THEMES[theme].label}`}
        </p>
        {themeError && <p className="mt-2 text-sm text-red-600" role="alert">{themeError}</p>}
      </section>
    </div>
  );
}
