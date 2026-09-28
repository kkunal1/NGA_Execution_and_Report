"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { BarChart3, CheckCircle2, Clock, Download as DownloadIcon, ListChecks, PlayCircle, ShieldBan, XCircle } from "lucide-react";
import type { RunResult, Summary, TestRow } from "@/lib/types";
import { DATA_PROVIDER_KEY, readNgaiNetworkOverride, type DataProvider } from "@/lib/provider";
import { THEME_KEY } from "@/lib/theme";
import { buildReportFilename } from "@/lib/report-html";

const SUITE_INPUT_KEY = "nga-suite-name-input";
const NGAI_RUN_KEY = "nga-ngai-last-run";
const NGAI_ABORTED_KEY = "nga-ngai-aborted-cache";

const COLORS: Record<string, string> = {
  Passed: "#16a34a",
  Failed: "#dc2626",
  Blocked: "#f59e0b",
  "In Progress": "#0ea5e9",
  "Not Run": "#94a3b8",
  Other: "#8b5cf6",
};

const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function Card({
  label,
  value,
  tone = "text-[var(--text)]",
  iconTone = "bg-slate-100 text-slate-500",
  cardTone = "bg-[var(--surface)] border-[var(--border)]",
  icon: Icon,
}: {
  label: string;
  value: string | number;
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
      </div>
    </div>
  );
}

export default function Dashboard() {
  // Restored lazily in an effect (not during render) so the client's first render matches SSR - reading
  // sessionStorage synchronously during the initial render/state-initializers caused a hydration mismatch.
  const restoredNgaiRef = useRef<{ suiteName: string; run: RunResult } | null>(null);

  const [run, setRun] = useState<RunResult | null>(null);
  const [abortedRows, setAbortedRows] = useState<TestRow[]>([]);
  const [runs, setRuns] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suiteNameInput, setSuiteNameInput] = useState("");
  const [provider, setProvider] = useState<DataProvider>("ngai");
  const [persisted, setPersisted] = useState(true);
  const [abortFrom, setAbortFrom] = useState("");
  const [abortTo, setAbortTo] = useState("");
  const [testFrom, setTestFrom] = useState("");
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async (runId?: string) => {
    const res = await fetch(`/api/runs${runId ? `?runId=${runId}` : ""}`);
    const data = (await res.json()) as { run: RunResult | null; runs: string[] };
    setRuns(data.runs);
    if (runId || !restoredNgaiRef.current) setRun(data.run);
  }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(NGAI_RUN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { suiteName: string; run: RunResult };
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
    setSuiteNameInput(window.sessionStorage.getItem(SUITE_INPUT_KEY) ?? restoredNgaiRef.current?.suiteName ?? "");
    void load();
  }, [load]);

  useEffect(() => {
    window.sessionStorage.setItem(SUITE_INPUT_KEY, suiteNameInput);
  }, [suiteNameInput]);

  useEffect(() => {
    const stored = window.localStorage.getItem(DATA_PROVIDER_KEY);
    if (stored === "sso" || stored === "ngai") setProvider(stored);
    const onStorage = (e: StorageEvent) => {
      if (e.key === DATA_PROVIDER_KEY && (e.newValue === "sso" || e.newValue === "ngai")) setProvider(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const capture = async (headless: boolean, suiteName?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headless, suiteName }),
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
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/test-run-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suiteName: suiteNameInput.trim(), ...readNgaiNetworkOverride() }),
      });
      const data = (await res.json()) as {
        error?: string;
        url?: string;
        summary?: Summary;
        rows?: TestRow[];
        warnings?: string[];
      };
      if (!res.ok) throw new Error(data.error ?? "NGAi query failed");
      const rows = data.rows ?? [];
      const adapted: RunResult = {
        meta: {
          runId: `ngai-${Date.now()}`,
          capturedAt: new Date().toISOString(),
          url: data.url ?? "",
          filter: { entity: "TestLine", field: "Suite", operator: "Equal", value: suiteNameInput.trim() },
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
      // Don't cache a zero-match result (usually a typo'd suite name) - otherwise it keeps
      // auto-restoring on reload, hiding the input box's real value and blocking new attempts.
      if (rows.length > 0) {
        window.sessionStorage.setItem(NGAI_RUN_KEY, JSON.stringify({ suiteName: suiteNameInput.trim(), run: adapted }));
      } else {
        window.sessionStorage.removeItem(NGAI_RUN_KEY);
      }
      await loadAbortedTests(suiteNameInput.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadAbortedTests = async (suiteName: string) => {
    try {
      const res = await fetch("/api/aborted-tests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suiteName, ...readNgaiNetworkOverride() }),
      });
      const data = (await res.json()) as { error?: string; rows?: TestRow[] };
      if (!res.ok) throw new Error(data.error ?? "Could not load aborted tests");
      const rows = data.rows ?? [];
      setAbortedRows(rows);
      window.sessionStorage.setItem(NGAI_ABORTED_KEY, JSON.stringify({ suiteName, rows }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const downloadReport = async () => {
    if (!run) return;
    setError(null);
    try {
      const abortRangeLabel = abortFrom || abortTo ? `${abortFrom || "earliest"} to ${abortTo || "latest"}` : "";
      const testRangeLabel = testFrom || testTo ? `${testFrom || "earliest"} to ${testTo || "latest"}` : "";
      const theme = window.localStorage.getItem(THEME_KEY) ?? undefined;
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run, abortedRows: filteredAbortedRows, abortRangeLabel, theme, latestExecutedRows, testRangeLabel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not generate report");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildReportFilename(run.meta.filter.value);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const s = run?.summary;
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
    const fromMs = abortFrom ? new Date(abortFrom).getTime() : null;
    const toMs = abortTo ? new Date(abortTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return abortedRows.filter((r) => {
      if (!fromMs && !toMs) return true;
      if (!r.date) return false;
      const ms = new Date(r.date).getTime();
      if (Number.isNaN(ms)) return false;
      if (fromMs != null && ms < fromMs) return false;
      if (toMs != null && ms > toMs) return false;
      return true;
    });
  }, [abortedRows, abortFrom, abortTo]);

  const abortedByStep = useMemo(() => {
    const byStep = new Map<string, number>();
    for (const r of filteredAbortedRows) {
      const key = r.abortStep || "(no step recorded)";
      byStep.set(key, (byStep.get(key) ?? 0) + 1);
    }
    return {
      total: filteredAbortedRows.length,
      steps: [...byStep.entries()].map(([step, count]) => ({ step, count })).sort((a, b) => b.count - a.count),
    };
  }, [filteredAbortedRows]);

  const latestExecutedRows = useMemo(() => {
    const fromMs = testFrom ? new Date(testFrom).getTime() : null;
    const toMs = testTo ? new Date(testTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    const executed = (run?.rows ?? []).filter((r) => r.bucket === "Passed" || r.bucket === "Failed");
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
  }, [run, testFrom, testTo]);

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
          <input
            type="text"
            value={suiteNameInput}
            onChange={(e) => setSuiteNameInput(e.target.value)}
            placeholder="Oak_Stream_Platform_1_DMR-Platform_Beta-PAIV-Platform-AP1_Beta_Regression_Cycle"
            className="w-80 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
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
          <button
            onClick={() => {
              if (provider === "ngai") {
                void captureNgai();
                return;
              }
              void capture(false, suiteNameInput.trim());
            }}
            disabled={busy || (provider === "sso" && !suiteNameInput.trim())}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Capturing…" : provider === "ngai" ? "Load NGAi data" : "Capture (visible)"}
          </button>
          {persisted && (
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
            <Card label="Passed" value={s.passed} tone="text-[var(--card-pass-label)]" icon={CheckCircle2} iconTone="bg-green-100 text-green-600" cardTone="bg-[var(--card-pass-bg)] border-[var(--card-pass-border)]" />
            <Card label="Failed" value={s.failed} tone="text-[var(--card-fail-label)]" icon={XCircle} iconTone="bg-red-100 text-red-600" cardTone="bg-[var(--card-fail-bg)] border-[var(--card-fail-border)]" />
            <Card label="Blocked" value={s.blocked} tone="text-[var(--card-blocked-label)]" icon={ShieldBan} iconTone="bg-amber-100 text-amber-600" cardTone="bg-[var(--card-blocked-bg)] border-[var(--card-blocked-border)]" />
            <Card label="In progress" value={s.inProgress} tone="text-[var(--card-progress-label)]" icon={Clock} iconTone="bg-sky-100 text-sky-600" cardTone="bg-[var(--card-progress-bg)] border-[var(--card-progress-border)]" />
            <Card label="Not run" value={s.notRun} tone="text-[var(--text-muted)]" icon={PlayCircle} iconTone="bg-slate-200 text-slate-600" cardTone="bg-[var(--surface-alt)] border-[var(--border)]" />
            {s.other > 0 && <Card label="Other" value={s.other} tone="text-[var(--card-violet-label)]" cardTone="bg-[var(--card-violet-bg)] border-[var(--card-violet-border)]" />}
          </section>

          <section className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-[var(--card-pass-border)] bg-[var(--card-pass-bg)] p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Pass rate</div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums text-[var(--card-pass-label)]">{s.passRatePct}%</div>
                </div>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(100, s.passRatePct)}%` }} />
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)] tabular-nums">{s.passed} / {s.tests} tests passed</div>
            </div>

            <div className="rounded-2xl border border-[var(--card-fail-border)] bg-[var(--card-fail-bg)] p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                  <XCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Fail rate</div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums text-[var(--card-fail-label)]">{failRatePct}%</div>
                </div>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${Math.min(100, failRatePct)}%` }} />
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)] tabular-nums">{s.failed} / {s.tests} tests failed</div>
            </div>

            <div className="rounded-2xl border border-[var(--card-blocked-border)] bg-[var(--card-blocked-bg)] p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                  <ShieldBan className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Blocked rate</div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums text-[var(--card-blocked-label)]">{blockedRatePct}%</div>
                </div>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(100, blockedRatePct)}%` }} />
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)] tabular-nums">{s.blocked} / {s.tests} tests blocked</div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] p-4 shadow-sm">
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
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] p-4 shadow-sm">
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
                    <Bar dataKey="value" fill="#0ea5e9" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

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
                      {["#", "Domain (Owner Team)", "Total", "Pass", "Pass %", "Fail", "Blocked", "Not run"].map(
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
                    {abortedByStep.steps.map((row, i) => (
                      <tr key={row.step} className="border-t border-[var(--border)] transition even:bg-[var(--surface-alt)] hover:bg-red-50/40">
                        <td className="px-3 py-2 text-[var(--text-muted)]">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-[var(--text)]">{row.step}</td>
                        <td className="px-3 py-2 tabular-nums text-red-600">{row.count}</td>
                      </tr>
                    ))}
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
                  Latest executed tests {latestExecutedRows.length > 0 && `(${latestExecutedRows.length})`}
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
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-alt)] text-[var(--text)]">
                  <tr>
                    {["#", "Domain", "Testline", "Status", "Date"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {latestExecutedRows.map((row, i) => (
                    <tr key={row.id} className="border-t border-[var(--border)] transition even:bg-[var(--surface-alt)] hover:bg-slate-50/40">
                      <td className="px-3 py-2 text-[var(--text-muted)]">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{row.domain || "-"}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)]">{row.testline}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.bucket === "Passed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {row.bucket === "Passed" ? "Pass" : "Fail"}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                        {row.date ? new Date(row.date).toLocaleString() : "-"}
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
