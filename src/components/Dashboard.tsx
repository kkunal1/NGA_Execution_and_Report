"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, CheckCircle2, ChevronDown, ChevronRight, Clock, Download as DownloadIcon, ListChecks, PlayCircle, Plus, ShieldBan, Trash2, X, XCircle } from "lucide-react";
import type { RunResult, Summary, TestRow } from "@/lib/types";
import { normalizeSuiteNames } from "@/lib/normalize";
import { summarize } from "@/lib/summarize";
import { DATA_PROVIDER_KEY, readNgaiNetworkOverride, type DataProvider } from "@/lib/provider";
import { THEME_KEY } from "@/lib/theme";
import { buildReportFilename } from "@/lib/report-html";
import { useAppRole } from "@/components/auth-context";
import { useRefreshSchedule } from "@/components/refresh-context";

const SUITE_INPUT_KEY = "nga-suite-name-input";
const NGAI_RUN_KEY = "nga-ngai-last-run";
const NGAI_ABORTED_KEY = "nga-ngai-aborted-cache";
const LATEST_EXECUTED_DISPLAY_LIMIT = 100;

const COLORS: Record<string, string> = {
  Passed: "#16a34a",
  Failed: "#dc2626",
  Blocked: "#f59e0b",
  "In Progress": "#0ea5e9",
  "Not Run": "#94a3b8",
  Other: "#8b5cf6",
};

const RAW_STATE_COLORS: Record<string, string> = {
  inprogress: "#f59e0b",
  passed: "#16a34a",
  failed: "#dc2626",
};

const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function Card({
  label,
  value,
  detail,
  tone = "text-[var(--text)]",
  iconTone = "bg-slate-100 text-slate-500",
  cardTone = "bg-[var(--surface)] border-[var(--border)]",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: string;
  iconTone?: string;
  cardTone?: string;
  icon?: typeof ListChecks;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cardTone}`}>
      {Icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
        <div className={`mt-0.5 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
        {detail && <div className={`mt-0.5 text-xs font-semibold tabular-nums ${tone}`}>{detail}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  // Restored lazily in an effect (not during render) so the client's first render matches SSR - reading
  // sessionStorage synchronously during the initial render/state-initializers caused a hydration mismatch.
  const restoredNgaiRef = useRef<{ suiteName?: string; suiteNames?: string[]; run: RunResult } | null>(null);
  const isAdmin = useAppRole() === "admin";
  const refreshContext = useRefreshSchedule();
  const setSharedRefreshSchedule = refreshContext?.setSchedule;
  const abortedSnapshotKey = useRef("");

  const [run, setRun] = useState<RunResult | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [checkedDataSuites, setCheckedDataSuites] = useState<string[]>([]);
  const [abortedRows, setAbortedRows] = useState<TestRow[]>([]);
  const [runs, setRuns] = useState<string[]>([]);
  const [suiteStateRestored, setSuiteStateRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suiteNames, setSuiteNames] = useState<string[]>([]);
  const [suiteDraft, setSuiteDraft] = useState("");
  const [provider, setProvider] = useState<DataProvider>("ngai");
  const [persisted, setPersisted] = useState(true);
  const [abortFrom, setAbortFrom] = useState("");
  const [abortTo, setAbortTo] = useState("");
  const [testFrom, setTestFrom] = useState("");
  const [testTo, setTestTo] = useState("");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(0);
  const [dashboardSettings, setDashboardSettings] = useState({ executionStatusSplit: true, rawStateValues: true });
  const autoRefreshInFlight = useRef(false);

  const load = useCallback(async (runId?: string) => {
    const res = await fetch(`/api/runs${runId ? `?runId=${runId}` : ""}`);
    const data = (await res.json()) as { run: RunResult | null; runs: string[]; version: string | null; nextRefreshAt: number | null; intervalSeconds: number };
    setRuns(data.runs);
    if (runId || data.run || !restoredNgaiRef.current) setRun(data.run);
    setLatestVersion(data.version);
    setNextRefreshAt(data.nextRefreshAt);
    setRefreshIntervalSeconds(data.intervalSeconds);
    if (data.run) setPersisted(data.run.meta.source !== "network");
  }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(NGAI_RUN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { suiteName?: string; suiteNames?: string[]; run: RunResult };
        restoredNgaiRef.current = parsed;
        setRun(parsed.run);
        setPersisted(false);
      }
    } catch {
      /* ignore corrupt cache */
    }
    try {
      const raw = window.sessionStorage.getItem(NGAI_ABORTED_KEY);
      if (raw) setAbortedRows((JSON.parse(raw) as { suiteName: string; rows: TestRow[] }).rows);
    } catch {
      /* ignore corrupt cache */
    }
    const savedSuites = window.sessionStorage.getItem(SUITE_INPUT_KEY);
    setSuiteNames(normalizeSuiteNames(
      savedSuites ?? restoredNgaiRef.current?.suiteNames ?? restoredNgaiRef.current?.suiteName,
    ));
    setSuiteStateRestored(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!suiteStateRestored) return;
    window.sessionStorage.setItem(SUITE_INPUT_KEY, suiteNames.join("\n"));
  }, [suiteNames, suiteStateRestored]);

  const selectedSuiteNames = normalizeSuiteNames([...suiteNames, suiteDraft]);
  const autoRefreshSuites = useMemo(
    () => suiteNames.length > 0
      ? suiteNames
      : run?.meta.source === "network"
        ? normalizeSuiteNames(run.meta.filter.value)
        : [],
    [suiteNames, run?.meta.source, run?.meta.filter.value],
  );

  const addSuiteNames = (values: string[]) => {
    setSuiteNames((current) => normalizeSuiteNames([...current, ...values]));
    setSuiteDraft("");
  };

  const addSuiteDraft = () => {
    const values = normalizeSuiteNames(suiteDraft);
    if (values.length) addSuiteNames(values);
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(DATA_PROVIDER_KEY);
    if (stored === "sso" || stored === "ngai") setProvider(stored);
    const onStorage = (e: StorageEvent) => {
      if (e.key === DATA_PROVIDER_KEY && (e.newValue === "sso" || e.newValue === "ngai")) setProvider(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadDashboardSettings = async () => {
      try {
        const response = await fetch("/api/settings/dashboard", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { executionStatusSplit?: boolean; rawStateValues?: boolean };
        if (!cancelled && typeof data.executionStatusSplit === "boolean" && typeof data.rawStateValues === "boolean") {
          setDashboardSettings({ executionStatusSplit: data.executionStatusSplit, rawStateValues: data.rawStateValues });
        }
      } catch {
        // Keep the charts enabled if shared settings are temporarily unavailable.
      }
    };
    void loadDashboardSettings();
    const timer = window.setInterval(() => void loadDashboardSettings(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const capture = async (headless: boolean, suites?: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headless, suiteNames: suites }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Capture failed");
      setRun(data as RunResult);
      setPersisted(true);
      window.sessionStorage.removeItem(NGAI_RUN_KEY);
      await load((data as RunResult).meta.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const captureNgai = async () => {
    const suites = selectedSuiteNames;
    if (suiteDraft.trim()) setSuiteNames(suites);
    setSuiteDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/test-run-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suiteNames: suites, persist: true, ...readNgaiNetworkOverride() }),
      });
      const data = (await res.json()) as {
        error?: string;
        url?: string;
        summary?: Summary;
        rows?: TestRow[];
        warnings?: string[];
        runId?: string;
        version?: string | null;
        nextRefreshAt?: number | null;
      };
      if (!res.ok) throw new Error(data.error ?? "NGAi query failed");
      const rows = data.rows ?? [];
      const adapted: RunResult = {
        meta: {
          runId: data.runId ?? `ngai-${Date.now()}`,
          capturedAt: new Date().toISOString(),
          url: data.url ?? "",
          filter: { entity: "TestLine", field: "Suite", operator: "Equal", value: suites.join("\n") },
          source: "network",
          stateColumn: "State",
          gridUnlocked: true,
          filterVerified: true,
          appliedCondition: ["TestLine", "Suite", "Equal"],
          reportedTotal: rows.length,
          durationMs: 0,
          warnings: data.warnings ?? [],
          observedEndpoints: data.url ? [data.url] : [],
          sampleRecord: rows[0]?.raw ?? null,
        },
        rows,
        summary: data.summary as Summary,
      };
      setRun(adapted);
      setPersisted(false);
      setLatestVersion(data.version ?? null);
      setNextRefreshAt(data.nextRefreshAt ?? null);
      // Don't cache a zero-match result (usually a typo'd suite name) - otherwise it keeps
      // auto-restoring on reload, hiding the input box's real value and blocking new attempts.
      if (rows.length > 0) {
        window.sessionStorage.setItem(NGAI_RUN_KEY, JSON.stringify({ suiteNames: suites, run: adapted }));
      } else {
        window.sessionStorage.removeItem(NGAI_RUN_KEY);
      }
      await loadAbortedTests(suites);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadAbortedTests = async (suites: string[]) => {
    try {
      const res = await fetch("/api/aborted-tests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suiteNames: suites, ...readNgaiNetworkOverride() }),
      });
      const data = (await res.json()) as { error?: string; rows?: TestRow[]; suiteNames?: string[] };
      if (!res.ok) throw new Error(data.error ?? "Could not load aborted tests");
      const rows = data.rows ?? [];
      setAbortedRows(rows);
      window.sessionStorage.setItem(NGAI_ABORTED_KEY, JSON.stringify({ suiteNames: data.suiteNames ?? suites, rows }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!run || run.meta.stateColumn !== "State" || autoRefreshSuites.length === 0) return;
    const requestKey = `${run.meta.runId}:${autoRefreshSuites.join("\n")}`;
    if (abortedSnapshotKey.current === requestKey) return;
    abortedSnapshotKey.current = requestKey;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/aborted-tests", { cache: "no-store" });
        if (!response.ok) return;
        const snapshot = (await response.json()) as { rows?: TestRow[]; suiteNames?: string[]; hasSnapshot?: boolean };
        if (cancelled) return;
        const rows = snapshot.rows ?? [];
        setAbortedRows(rows);
        window.sessionStorage.setItem(NGAI_ABORTED_KEY, JSON.stringify({ suiteNames: snapshot.suiteNames ?? [], rows }));
        const cachedSuites = new Set((snapshot.suiteNames ?? []).map((suite) => suite.toLowerCase()));
        if (isAdmin && (!snapshot.hasSnapshot || autoRefreshSuites.some((suite) => !cachedSuites.has(suite.toLowerCase())))) {
          await loadAbortedTests(autoRefreshSuites);
        }
      } catch (cause) {
        if (!cancelled && isAdmin) setError(cause instanceof Error ? cause.message : "Could not load shared aborted tests.");
      }
    })();
    return () => { cancelled = true; };
  }, [run?.meta.runId, run?.meta.stateColumn, isAdmin, autoRefreshSuites]);

  useEffect(() => {
    if (!isAdmin) return;
    void fetch("/api/settings/refresh", { cache: "no-store" })
      .then(async (response) => {
        const settings = (await response.json()) as { intervalSeconds?: number };
        if (response.ok) setRefreshIntervalSeconds(settings.intervalSeconds ?? 0);
      })
      .catch(() => setRefreshIntervalSeconds(0));
  }, [isAdmin]);

  useEffect(() => {
    setSharedRefreshSchedule?.({ nextRefreshAt, intervalSeconds: refreshIntervalSeconds });
  }, [setSharedRefreshSchedule, nextRefreshAt, refreshIntervalSeconds]);

  useEffect(() => {
    if (!latestVersion) return;
    let checking = false;
    const checkForUpdate = async () => {
      if (checking) return;
      checking = true;
      try {
        const checkResponse = await fetch("/api/runs?checkOnly=1", { cache: "no-store" });
        if (!checkResponse.ok) return;
        const check = (await checkResponse.json()) as { version: string | null; nextRefreshAt: number | null; intervalSeconds: number };
        setNextRefreshAt(check.nextRefreshAt);
        setRefreshIntervalSeconds(check.intervalSeconds);
        if (!check.version || check.version === latestVersion) return;
        const latestResponse = await fetch("/api/runs?latestOnly=1", { cache: "no-store" });
        if (!latestResponse.ok) return;
        const data = (await latestResponse.json()) as { run: RunResult | null; version: string | null; nextRefreshAt: number | null; intervalSeconds: number };
        if (data.run) {
          setRun(data.run);
          setPersisted(data.run.meta.source !== "network");
        }
        setLatestVersion(data.version);
        setNextRefreshAt(data.nextRefreshAt);
        setRefreshIntervalSeconds(data.intervalSeconds);
      } catch {
        // Keep the last known snapshot visible if the server is temporarily unavailable.
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void checkForUpdate(), 5000);
    return () => window.clearInterval(timer);
  }, [latestVersion]);

  useEffect(() => {
    if (!isAdmin || refreshIntervalSeconds === 0 || run?.meta.stateColumn !== "State" || autoRefreshSuites.length === 0) return;
    let cancelled = false;
    let timer: number | undefined;
    const refresh = async () => {
      if (autoRefreshInFlight.current || document.visibilityState === "hidden") return;
      autoRefreshInFlight.current = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 120_000);
      try {
        const response = await fetch("/api/test-run-data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            suiteNames: autoRefreshSuites,
            persist: true,
            automatic: true,
            ...readNgaiNetworkOverride(),
          }),
        });
        const result = (await response.json()) as { error?: string; changed?: boolean; version?: string | null; nextRefreshAt?: number | null };
        if (!response.ok) throw new Error(result.error || "Automatic NGAi refresh failed.");
        if (cancelled) return;
        setLatestVersion(result.version ?? null);
        setNextRefreshAt(result.nextRefreshAt ?? null);
        if (result.changed) {
          const latestResponse = await fetch("/api/runs?latestOnly=1", { cache: "no-store" });
          if (latestResponse.ok) {
            const latest = (await latestResponse.json()) as { run: RunResult | null; version: string | null; nextRefreshAt: number | null };
            if (latest.run) {
              setRun(latest.run);
              setPersisted(false);
              setLatestVersion(latest.version);
              setNextRefreshAt(latest.nextRefreshAt);
            }
          }
          const abortedResponse = await fetch("/api/aborted-tests", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ suiteNames: autoRefreshSuites, ...readNgaiNetworkOverride() }),
          });
          if (abortedResponse.ok) {
            const aborted = (await abortedResponse.json()) as { rows?: TestRow[] };
            setAbortedRows(aborted.rows ?? []);
          }
        }
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "Automatic NGAi refresh failed.");
      } finally {
        window.clearTimeout(timeout);
        autoRefreshInFlight.current = false;
      }
    };
    const schedule = () => {
      if (cancelled) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        await refresh();
        schedule();
      }, refreshIntervalSeconds * 1000);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      schedule();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [isAdmin, refreshIntervalSeconds, run?.meta.stateColumn, autoRefreshSuites]);

  const availableSuites = useMemo(() => run
    ? normalizeSuiteNames([run.meta.filter.value, ...run.rows.map((row) => row.suite)])
    : [], [run]);

  useEffect(() => {
    setCheckedDataSuites(availableSuites);
  }, [availableSuites]);

  const checkedSuiteKeys = useMemo(
    () => new Set(checkedDataSuites.map((suite) => suite.toLowerCase())),
    [checkedDataSuites],
  );

  // Older saved runs have no suite name; their numbers aren't tied to any suite, so show zeros instead.
  const runHasSuite = normalizeSuiteNames(run?.meta.filter.value).length > 0;

  const visibleRows = useMemo(() => {
    if (!runHasSuite) return [];
    const rows = run?.rows ?? [];
    if (availableSuites.length < 2 || checkedDataSuites.length === availableSuites.length) return rows;
    return rows.filter((row) => checkedSuiteKeys.has(row.suite.trim().toLowerCase()));
  }, [run, runHasSuite, availableSuites.length, checkedDataSuites.length, checkedSuiteKeys]);

  const visibleSummary = useMemo(
    () => run ? summarize(visibleRows) : undefined,
    [run, visibleRows],
  );
  const displayedRun = run
    ? {
        ...run,
        rows: visibleRows,
        summary: visibleSummary,
        meta: {
          ...run.meta,
          filter: { ...run.meta.filter, value: checkedDataSuites.join("\n") },
        },
      }
    : null;
  const allSuitesSelected = availableSuites.length < 2 || checkedDataSuites.length === availableSuites.length;

  const downloadReport = async () => {
    if (!displayedRun) return;
    setError(null);
    try {
      const abortRangeLabel = abortFrom || abortTo ? `${abortFrom || "earliest"} to ${abortTo || "latest"}` : "";
      const testRangeLabel = testFrom || testTo ? `${testFrom || "earliest"} to ${testTo || "latest"}` : "";
      const theme = window.localStorage.getItem(THEME_KEY) ?? undefined;
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run: displayedRun, abortedRows: filteredAbortedRows, abortRangeLabel, theme, latestExecutedRows: displayedExecutedRows, latestExecutedTotal: latestExecutedRows.length, testRangeLabel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not generate report");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildReportFilename(displayedRun.meta.filter.value);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const s = run ? visibleSummary : undefined;
  const failRatePct = s ? pctOf(s.failed, s.tests) : 0;
  const blockedRatePct = s ? pctOf(s.blocked, s.tests) : 0;

  const setLast7Days = () => {
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
    setAbortFrom(from.toISOString().slice(0, 10));
    setAbortTo(to.toISOString().slice(0, 10));
  };

  const setTestLast7Days = () => {
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
    setTestFrom(from.toISOString().slice(0, 10));
    setTestTo(to.toISOString().slice(0, 10));
  };

  const filteredAbortedRows = useMemo(() => {
    if (!runHasSuite) return [];
    const fromMs = abortFrom ? new Date(abortFrom).getTime() : null;
    const toMs = abortTo ? new Date(abortTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return abortedRows.filter((r) => {
      if (availableSuites.length > 1 && checkedDataSuites.length !== availableSuites.length &&
        !checkedSuiteKeys.has(r.suite.trim().toLowerCase())) return false;
      if (!fromMs && !toMs) return true;
      if (!r.date) return false;
      const ms = new Date(r.date).getTime();
      if (Number.isNaN(ms)) return false;
      if (fromMs != null && ms < fromMs) return false;
      if (toMs != null && ms > toMs) return false;
      return true;
    });
  }, [runHasSuite, abortedRows, abortFrom, abortTo, availableSuites.length, checkedDataSuites.length, checkedSuiteKeys]);

  const abortedByStep = useMemo(() => {
    // Cached aborted rows may predate the ValidationGroup expand, so fall back to the main run's domain.
    const domainByTestline = new Map<string, string>();
    for (const r of run?.rows ?? []) {
      if (r.domain && r.testline) domainByTestline.set(r.testline, r.domain);
    }
    const byStep = new Map<string, TestRow[]>();
    for (const raw of filteredAbortedRows) {
      const r = raw.domain ? raw : { ...raw, domain: domainByTestline.get(raw.testline) ?? "" };
      const key = r.abortStep || "Aborted Manually";
      const list = byStep.get(key);
      if (list) list.push(r);
      else byStep.set(key, [r]);
    }
    return {
      total: filteredAbortedRows.length,
      steps: [...byStep.entries()]
        .map(([step, rows]) => ({
          step,
          count: rows.length,
          rows: [...rows].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }, [filteredAbortedRows, run]);

  const [expandedAbortSteps, setExpandedAbortSteps] = useState<Set<string>>(() => new Set());
  const toggleAbortStep = (step: string) => {
    setExpandedAbortSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

  const latestExecutedRows = useMemo(() => {
    const fromMs = testFrom ? new Date(testFrom).getTime() : null;
    const toMs = testTo ? new Date(testTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    const executed = visibleRows.filter((r) => r.bucket === "Passed" || r.bucket === "Failed");
    const filtered = executed.filter((r) => {
      if (!fromMs && !toMs) return true;
      if (!r.date) return false;
      const ms = new Date(r.date).getTime();
      if (Number.isNaN(ms)) return false;
      if (fromMs != null && ms < fromMs) return false;
      if (toMs != null && ms > toMs) return false;
      return true;
    });
    return [...filtered].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  }, [visibleRows, testFrom, testTo]);

  const displayedExecutedRows = useMemo(() => latestExecutedRows.slice(0, LATEST_EXECUTED_DISPLAY_LIMIT), [latestExecutedRows]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-[var(--border)] bg-gradient-to-r from-[var(--header-from)] via-[var(--surface)] to-[var(--surface)] p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">NGA Execution Progress</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {run
                ? `${run.meta.filter.entity} / ${run.meta.filter.field} / ${run.meta.filter.operator} /`
                : "TestLine / Suite / Equal /"}{" "}
                <code className="rounded-md bg-[var(--surface-alt)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                {run?.meta.filter.value ??
                  "Oak_Stream_Platform_1_DMR-Platform_Beta-PAIV-Platform-AP1_Beta_Regression_Cycle"}
              </code>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
          <div className="flex min-h-10 min-w-[min(100%,20rem)] flex-1 flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 shadow-sm focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-200">
            {suiteNames.map((suite) => (
              <span key={suite.toLowerCase()} className="inline-flex max-w-full items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface-alt)] py-1 pl-2 pr-1 text-sm text-[var(--text)]">
                <span className="max-w-64 truncate" title={suite}>{suite}</span>
                <button
                  type="button"
                  aria-label={`Remove suite ${suite}`}
                  title={`Remove ${suite}`}
                  onClick={() => setSuiteNames((current) => current.filter((value) => value.toLowerCase() !== suite.toLowerCase()))}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={suiteDraft}
              onChange={(event) => setSuiteDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addSuiteDraft();
                }
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text");
                if (/\r?\n/.test(pasted)) {
                  event.preventDefault();
                  addSuiteNames(pasted.split(/\r?\n/));
                }
              }}
              placeholder="Type or paste suite name"
              aria-label="Suite name"
              className="min-w-48 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
            />
            {suiteNames.length > 0 && (
              <button
                type="button"
                aria-label="Clear all suites"
                title="Clear all suites"
                onClick={() => setSuiteNames([])}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--text)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {suiteDraft.trim() && (
              <button
                type="button"
                aria-label="Add suite"
                title="Add suite"
                onClick={addSuiteDraft}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--accent)] text-[var(--accent-text)]"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          )}
          <select
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] shadow-sm"
            value={run?.meta.runId ?? ""}
            onChange={(e) => void load(e.target.value)}
          >
            {!runs.length && <option value="">no runs yet</option>}
            {runs.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {isAdmin && <button
            onClick={() => {
              if (provider === "ngai") {
                void captureNgai();
                return;
              }
              setSuiteNames(selectedSuiteNames);
              setSuiteDraft("");
              void capture(false, selectedSuiteNames);
            }}
            disabled={busy || (provider === "sso" && selectedSuiteNames.length === 0)}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Capturing…" : provider === "ngai" ? "Load NGAi data" : "Capture (visible)"}
          </button>}
          {persisted && allSuitesSelected && (
            <a
              href={`/api/report${run ? `?runId=${run.meta.runId}` : ""}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] shadow-sm transition hover:opacity-80"
            >
              HTML report
            </a>
          )}
          {run && (
            <button
              type="button"
              onClick={() => void downloadReport()}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] shadow-sm transition hover:opacity-80"
            >
              <DownloadIcon className="h-4 w-4" />
              Download
            </button>
          )}
        </div>
      </header>

      {availableSuites.length > 1 && (
        <fieldset aria-label="Filter dashboard by loaded suite" className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Loaded suites</legend>
          {availableSuites.map((suite) => (
            <label key={suite.toLowerCase()} className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={checkedSuiteKeys.has(suite.toLowerCase())}
                onChange={(event) => setCheckedDataSuites((current) => event.target.checked
                  ? normalizeSuiteNames([...current, suite])
                  : current.filter((value) => value.toLowerCase() !== suite.toLowerCase()))}
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="max-w-[min(70vw,32rem)] truncate" title={suite}>{suite}</span>
            </label>
          ))}
          <span className="ml-auto text-xs tabular-nums text-[var(--text-muted)]">
            {checkedDataSuites.length} / {availableSuites.length} selected
          </span>
        </fieldset>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
          {error}
        </div>
      )}

      {!run && !busy && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-[var(--text-muted)] shadow-sm">
          No data captured yet. Click <b>Capture</b> to open NGA, apply the filter, press
          Search and collect the loaded records.
        </div>
      )}

      {run && s && (
        <>
          {!run.meta.filterVerified && (
            <section className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
              <b>Filter did not verify — these numbers are not trustworthy.</b>
              <div className="mt-1">
                Applied row read back as:{" "}
                <code className="rounded bg-red-100 px-1.5 py-0.5">
                  {run.meta.appliedCondition.join(" / ") || "(empty)"}
                </code>
              </div>
            </section>
          )}
          {run.meta.filterVerified && (
            <p className="mb-4 text-sm font-medium text-green-700">
              ✓ Filter verified: {run.meta.appliedCondition.join(" / ")}
            </p>
          )}

          {!!run.meta.warnings.length && (
            <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
              <b>Capture warnings — numbers may be unreliable</b>
              <ul className="mt-2 list-disc pl-5">
                {run.meta.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Card label="Total tests" value={s.tests} icon={ListChecks} iconTone="bg-slate-200 text-slate-600" cardTone="bg-[var(--surface-alt)] border-[var(--border)]" />
            <Card label="Passed" value={s.passed} detail={`${s.passRatePct}%`} tone="text-[var(--card-pass-label)]" icon={CheckCircle2} iconTone="bg-green-100 text-green-600" cardTone="bg-[var(--card-pass-bg)] border-[var(--card-pass-border)]" />
            <Card label="Failed" value={s.failed} detail={`${failRatePct}%`} tone="text-[var(--card-fail-label)]" icon={XCircle} iconTone="bg-red-100 text-red-600" cardTone="bg-[var(--card-fail-bg)] border-[var(--card-fail-border)]" />
            <Card label="Blocked" value={s.blocked} detail={`${blockedRatePct}%`} tone="text-[var(--card-blocked-label)]" icon={ShieldBan} iconTone="bg-amber-100 text-amber-600" cardTone="bg-[var(--card-blocked-bg)] border-[var(--card-blocked-border)]" />
            <Card label="In progress" value={s.inProgress} tone="text-[var(--card-progress-label)]" icon={Clock} iconTone="bg-sky-100 text-sky-600" cardTone="bg-[var(--card-progress-bg)] border-[var(--card-progress-border)]" />
            <Card label="Not run" value={s.notRun} tone="text-[var(--text-muted)]" icon={PlayCircle} iconTone="bg-slate-200 text-slate-600" cardTone="bg-[var(--surface-alt)] border-[var(--border)]" />
            {s.other > 0 && <Card label="Other" value={s.other} tone="text-[var(--card-violet-label)]" cardTone="bg-[var(--card-violet-bg)] border-[var(--card-violet-border)]" />}
          </section>

          {(dashboardSettings.executionStatusSplit || dashboardSettings.rawStateValues) && (
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {dashboardSettings.executionStatusSplit && <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Execution status split
              </h2>
              <div className="flex items-center gap-4">
                <div className="h-64 w-1/2 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={s.byState}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {s.byState.map((entry) => (
                          <Cell key={entry.name} fill={COLORS[entry.name] ?? "#64748b"} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-2 text-sm">
                  {s.byState.map((entry) => (
                    <li key={entry.name} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[var(--text-muted)]">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: COLORS[entry.name] ?? "#64748b" }}
                        />
                        {entry.name}
                      </span>
                      <span className="font-semibold tabular-nums text-[var(--text)]">
                        {entry.value} <span className="font-normal text-[var(--text-muted)]">({pctOf(entry.value, s.tests)}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>}

            {dashboardSettings.rawStateValues && <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Raw “{run.meta.stateColumn}” values
              </h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.byRawState.slice(0, 12)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0ea5e9">
                      {s.byRawState.slice(0, 12).map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={RAW_STATE_COLORS[entry.name.replace(/\s+/g, "").toLowerCase()] ?? "#0ea5e9"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>}
          </section>
          )}

          {(s.byDomain ?? []).length > 1 && (
            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Domain-wise data
                </h2>
                <button
                  type="button"
                  onClick={() => void downloadReport()}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] shadow-sm transition hover:opacity-80"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                  Export
                </button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-indigo-50 text-indigo-900">
                    <tr>
                      {["#", "Domain (Owner Team)", "Total", "Pass", "Pass %", "Fail", "Bucketized", "Blocked", "Not run"].map(
                        (h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(s.byDomain ?? []).map((d, i) => (
                      <tr key={d.domain} className="border-t border-[var(--border)] transition even:bg-[var(--surface-alt)] hover:bg-indigo-50/40">
                        <td className="px-3 py-2 text-[var(--text-muted)]">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-[var(--text)]">{d.domain}</td>
                        <td className="px-3 py-2 tabular-nums">{d.tests}</td>
                        <td className="px-3 py-2 tabular-nums text-green-600">{d.passed}</td>
                        <td className="px-3 py-2 tabular-nums">{d.passRatePct}%</td>
                        <td className="px-3 py-2 tabular-nums text-red-600">{d.failed}</td>
                        <td className="px-3 py-2 tabular-nums">
                          <div className="flex items-center gap-2.5">
                            <span className="font-semibold">{d.bucketized ?? 0}</span>
                            <span className="flex flex-col whitespace-nowrap text-[11px] leading-4">
                              <span className="text-sky-500">HSD {d.bucketizedWithHsd ?? 0}</span>
                              <span className="text-[var(--text-muted)]">No HSD {d.bucketizedWithoutHsd ?? 0}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-amber-600">{d.blocked}</td>
                        <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">{d.notRun}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-[var(--border)] bg-indigo-50 font-semibold text-indigo-900">
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2">Total / Average</td>
                      <td className="px-3 py-2 tabular-nums">{s.tests}</td>
                      <td className="px-3 py-2 tabular-nums text-green-600">{s.passed}</td>
                      <td className="px-3 py-2 tabular-nums">{s.passRatePct}%</td>
                      <td className="px-3 py-2 tabular-nums text-red-600">{s.failed}</td>
                      <td className="px-3 py-2 tabular-nums">
                        <div className="flex items-center gap-2.5">
                          <span>{s.bucketized ?? 0}</span>
                          <span className="flex flex-col whitespace-nowrap text-[11px] leading-4">
                            <span className="text-sky-700">HSD {s.bucketizedWithHsd ?? 0}</span>
                            <span className="text-[var(--text-muted)]">No HSD {s.bucketizedWithoutHsd ?? 0}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-amber-600">{s.blocked}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">{s.notRun}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {abortedByStep.total > 0 || abortFrom || abortTo ? (
            <section className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Aborted tests {abortedByStep.total > 0 && `(${abortedByStep.total})`}
                  </h2>
                  {(abortFrom || abortTo) && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Filtered range: {abortFrom || "earliest"} to {abortTo || "latest"}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={abortFrom}
                    onChange={(e) => setAbortFrom(e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] shadow-sm"
                  />
                  <span className="text-sm text-[var(--text-muted)]">to</span>
                  <input
                    type="date"
                    value={abortTo}
                    onChange={(e) => setAbortTo(e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={setLast7Days}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] shadow-sm transition hover:opacity-80"
                  >
                    Last 7 days
                  </button>
                  {(abortFrom || abortTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setAbortFrom("");
                        setAbortTo("");
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] shadow-sm transition hover:opacity-80"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-red-50 text-red-900">
                    <tr>
                      {["#", "Aborted at step (reason)", "Count"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {abortedByStep.steps.map((row, i) => {
                      const expanded = expandedAbortSteps.has(row.step);
                      return (
                        <Fragment key={row.step}>
                          <tr
                            onClick={() => toggleAbortStep(row.step)}
                            className="cursor-pointer border-t border-[var(--border)] transition even:bg-[var(--surface-alt)] hover:bg-red-50/40"
                          >
                            <td className="px-3 py-2 text-[var(--text-muted)]">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-[var(--text)]">
                              <button
                                type="button"
                                aria-expanded={expanded}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAbortStep(row.step);
                                }}
                                className="inline-flex items-center gap-2 text-left"
                              >
                                {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                {row.step}
                              </button>
                            </td>
                            <td className="px-3 py-2 tabular-nums text-red-600">{row.count}</td>
                          </tr>
                          {expanded && (
                            <tr className="border-t border-[var(--border)]">
                              <td colSpan={3} className="bg-[var(--surface-alt)] px-3 py-3">
                                <div className="max-h-96 overflow-auto rounded-lg border border-[var(--border)]">
                                  <table className="w-full table-fixed text-xs">
                                    <colgroup>
                                      <col className="w-10" />
                                      <col className="w-44" />
                                      <col />
                                      <col className="w-44" />
                                      <col className="w-24" />
                                    </colgroup>
                                    <thead className="sticky top-0 bg-[var(--surface)] text-[var(--text)]">
                                      <tr>
                                        {["#", "Domain", "Testline", "Date", "More Info"].map((h) => (
                                          <th key={h} className="px-3 py-2 text-left font-medium">
                                            {h}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.rows.map((t, j) => (
                                        <tr key={t.id} className="border-t border-[var(--border)]">
                                          <td className="px-3 py-1.5 text-[var(--text-muted)]">{j + 1}</td>
                                          <td className="truncate px-3 py-1.5 font-medium text-[var(--text)]" title={t.domain || undefined}>{t.domain || "-"}</td>
                                          <td className="break-all px-3 py-1.5 text-[var(--text-muted)]" title={t.testline}>{t.testline || t.name}</td>
                                          <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[var(--text-muted)]">
                                            {t.date
                                              ? new Date(t.date).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                              : "-"}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-1.5">
                                            <a
                                              href={`https://nga.laas.intel.com/#/dmr_pv/planning/testResult/${encodeURIComponent(t.id)}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                                            >
                                              More Info
                                            </a>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!abortedByStep.steps.length && (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-[var(--text-muted)]">
                          No aborted tests in the selected range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Latest executed tests{" "}
                  {latestExecutedRows.length > 0 &&
                    (latestExecutedRows.length > displayedExecutedRows.length
                      ? `(showing ${displayedExecutedRows.length} of ${latestExecutedRows.length})`
                      : `(${latestExecutedRows.length})`)}
                </h2>
                {(testFrom || testTo) && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Filtered range: {testFrom || "earliest"} to {testTo || "latest"}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={testFrom}
                  onChange={(e) => setTestFrom(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] shadow-sm"
                />
                <span className="text-sm text-[var(--text-muted)]">to</span>
                <input
                  type="date"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] shadow-sm"
                />
                <button
                  type="button"
                  onClick={setTestLast7Days}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] shadow-sm transition hover:opacity-80"
                >
                  Last 7 days
                </button>
                {(testFrom || testTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTestFrom("");
                      setTestTo("");
                    }}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] shadow-sm transition hover:opacity-80"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-44" />
                  <col />
                  <col className="w-24" />
                  <col className="w-48" />
                </colgroup>
                <thead className="bg-[var(--surface-alt)] text-[var(--text)]">
                  <tr>
                    {["#", "Domain", "Testline", "Status", "Date"].map((h) => (
                      <th key={h} className={`px-3 py-2 font-medium ${h === "Status" ? "text-center" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedExecutedRows.map((row, i) => (
                    <tr key={row.id} className="border-t border-[var(--border)] align-middle transition even:bg-[var(--surface-alt)] hover:bg-slate-50/40">
                      <td className="px-3 py-2 text-[var(--text-muted)]">{i + 1}</td>
                      <td className="truncate px-3 py-2 font-medium text-[var(--text)]" title={row.domain || undefined}>{row.domain || "-"}</td>
                      <td className="px-3 py-2 text-xs break-all text-[var(--text-muted)]" title={row.testline}>{row.testline}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.bucket === "Passed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {row.bucket === "Passed" ? "Pass" : "Fail"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text-muted)]">
                        {row.date
                          ? new Date(row.date).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "-"}
                      </td>
                    </tr>
                  ))}
                  {!latestExecutedRows.length && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-[var(--text-muted)]">
                        No executed tests in the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {run.meta.sampleRecord && (
            <details className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm shadow-sm">
              <summary className="cursor-pointer font-medium text-[var(--text)]">
                Sample captured record (use this to fix column mapping)
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                {JSON.stringify(run.meta.sampleRecord, null, 2)}
              </pre>
              <div className="mt-3 text-xs text-[var(--text-muted)]">
                Endpoints seen: {run.meta.observedEndpoints.join(", ") || "none"}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
