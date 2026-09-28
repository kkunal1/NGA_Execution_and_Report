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

export default function SettingsPage() {
  const [provider, setProvider] = useState<DataProvider>("ngai");
  const [saved, setSaved] = useState(false);
  const [vpnConnected, setVpnConnected] = useState(true);
  const [proxyUrl, setProxyUrl] = useState("");
  const [networkSaved, setNetworkSaved] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("professional");
  const [themeSaved, setThemeSaved] = useState(false);
  const [ngaiToken, setNgaiToken] = useState("");
  const [ngaiTokenStatus, setNgaiTokenStatus] = useState<NgaiTokenStatus | null>(null);
  const [ngaiTokenMessage, setNgaiTokenMessage] = useState("");
  const [ngaiTokenError, setNgaiTokenError] = useState("");
  const [ngaiTokenBusy, setNgaiTokenBusy] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState("60");
  const [refreshSaved, setRefreshSaved] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(DATA_PROVIDER_KEY);
    if (stored === "sso" || stored === "ngai") setProvider(stored);
    const storedVpn = window.localStorage.getItem(NGAI_VPN_KEY);
    if (storedVpn === "true" || storedVpn === "false") setVpnConnected(storedVpn === "true");
    setProxyUrl(window.localStorage.getItem(NGAI_PROXY_KEY) ?? "");
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    if (isThemeId(storedTheme)) setTheme(storedTheme);
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

  const saveTheme = (value: ThemeId) => {
    setTheme(value);
    window.localStorage.setItem(THEME_KEY, value);
    document.documentElement.setAttribute("data-theme", value);
    setThemeSaved(true);
    window.setTimeout(() => setThemeSaved(false), 1800);
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
          {themeSaved ? "Theme saved." : `Current theme: ${THEMES[theme].label}`}
        </p>
      </section>
    </div>
  );
}
