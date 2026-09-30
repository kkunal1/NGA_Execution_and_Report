"use client";

import { FormEvent, useEffect, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import type { ExecutionTimeSummary } from "@/lib/execution-time";

const EXECUTION_TIME_STATE_KEY = "nga-execution-time-state";

type SavedExecutionTimeState = { searchedSuite: string; summaries: ExecutionTimeSummary[] };

function formatDuration(seconds: number) {
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${remainingSeconds}s`;
}

function formatDays(seconds: number) {
  return `${(seconds / (24 * 60 * 60)).toFixed(2)} days`;
}

function formatMinutes(seconds: number) {
  return `${(seconds / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })} min`;
}

export default function ExecutionTimeChecker() {
  const [suiteName, setSuiteName] = useState("");
  const [summaries, setSummaries] = useState<ExecutionTimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedSuite, setSearchedSuite] = useState("");
  const [exportFormat, setExportFormat] = useState<"excel" | "html">("excel");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Restored in an effect (not during render) so the first client render matches SSR.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(EXECUTION_TIME_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedExecutionTimeState;
      if (!saved.searchedSuite || !Array.isArray(saved.summaries)) return;
      setSuiteName(saved.searchedSuite);
      setSearchedSuite(saved.searchedSuite);
      setSummaries(saved.summaries);
    } catch {
      window.sessionStorage.removeItem(EXECUTION_TIME_STATE_KEY);
    }
  }, []);

  const clearData = () => {
    window.sessionStorage.removeItem(EXECUTION_TIME_STATE_KEY);
    setSuiteName("");
    setSearchedSuite("");
    setSummaries([]);
    setError(null);
    setDownloadError(null);
  };

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch("/api/execution-time/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: exportFormat, suiteName: searchedSuite, summaries }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not create the download.");
      }
      const fileName = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]
        ?? `execution-time.${exportFormat === "excel" ? "xlsx" : "html"}`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : "Could not create the download.");
    } finally {
      setDownloading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!suiteName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/execution-time", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suiteName: suiteName.trim() }),
      });
      const data = (await response.json()) as { summaries?: ExecutionTimeSummary[]; suiteName?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not calculate execution time.");
      const nextSummaries = data.summaries ?? [];
      const nextSuite = data.suiteName ?? suiteName.trim();
      setSummaries(nextSummaries);
      setSearchedSuite(nextSuite);
      try {
        window.sessionStorage.setItem(EXECUTION_TIME_STATE_KEY, JSON.stringify({ searchedSuite: nextSuite, summaries: nextSummaries } satisfies SavedExecutionTimeState));
      } catch {
        // Very large results can exceed the browser storage quota; the page still works without restore.
      }
    } catch (cause) {
      setSummaries([]);
      setError(cause instanceof Error ? cause.message : "Could not calculate execution time.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] shadow-sm">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h1 className="text-lg font-semibold text-[var(--text)]">Check Execution Time</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Calculate total test execution time by subsystem.</p>
        <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
          <input
            value={suiteName}
            onChange={(event) => setSuiteName(event.target.value)}
            placeholder="Enter suite name"
            aria-label="Suite name"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="submit"
            disabled={loading || !suiteName.trim()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Checking…" : "Check execution time"}
          </button>
          {(searchedSuite || summaries.length > 0 || error) && (
            <button
              type="button"
              onClick={clearData}
              disabled={loading}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear Data
            </button>
          )}
        </form>
      </div>

      {error && <p className="px-5 py-6 text-sm text-red-600">{error}</p>}
      {!loading && !error && searchedSuite && summaries.length === 0 && (
        <p className="px-5 py-8 text-sm text-[var(--text-muted)]">No execution records found for this suite.</p>
      )}
      {summaries.length > 0 && (
        <div className="px-5 py-3 text-sm text-[var(--text-muted)]">
          Suite: <span className="font-medium text-[var(--text)]">{searchedSuite}</span>
        </div>
      )}
    </section>

    <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Check Execution Time - Test Data</h2>
        {summaries.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as "excel" | "html")}
              aria-label="Download format"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            >
              <option value="excel">Excel</option>
              <option value="html">HTML</option>
            </select>
            <button
              type="button"
              onClick={() => void download()}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {downloading ? "Preparing…" : "Download"}
            </button>
          </div>
        )}
      </div>
      {downloadError && <p className="px-5 pt-3 text-sm text-red-600">{downloadError}</p>}
      {summaries.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[var(--text-muted)]">Submit a suite name above to load data.</p>
      ) : (
        <div className="overflow-auto">
          <ExecutionTimeTable summaries={summaries} />
        </div>
      )}
    </section>
    </>
  );
}

function ExecutionTimeTable({ summaries }: { summaries: ExecutionTimeSummary[] }) {
  return (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-5 py-3 font-semibold">Subsystem name</th>
                <th className="px-5 py-3 font-semibold">Total test count</th>
                <th className="px-5 py-3 font-semibold">Total execution time</th>
                <th className="px-5 py-3 font-semibold">Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {summaries.map((summary) => (
                <tr key={summary.subsystemName}>
                  <td colSpan={4} className="p-0">
                    <details className="group">
                      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,2fr)_minmax(7rem,1fr)_minmax(14rem,1.5fr)_minmax(7rem,1fr)] items-center gap-2 px-5 py-3 hover:bg-[var(--surface)] [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--text)]">
                          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-90" />
                          <span className="truncate">{summary.subsystemName}</span>
                        </span>
                        <span className="tabular-nums text-[var(--text)]">{summary.totalTestCount}</span>
                        <span className="tabular-nums text-[var(--text)]">
                          {formatDuration(summary.totalSeconds)}
                          {summary.excludedTestCount > 0 && (
                            <span className="ml-2 text-xs text-[var(--text-muted)]">({summary.excludedTestCount} without timestamps)</span>
                          )}
                        </span>
                        <span className="tabular-nums text-[var(--text)]">{formatDays(summary.totalSeconds)}</span>
                      </summary>
                      <div className="border-t border-[var(--border)] bg-black/5 px-5 py-3">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[var(--text-muted)]">
                            <tr>
                              <th className="px-3 py-2 font-semibold">Configuration</th>
                              <th className="px-3 py-2 font-semibold">Total test count</th>
                              <th className="px-3 py-2 font-semibold">Total execution time</th>
                              <th className="px-3 py-2 font-semibold">Days</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {summary.configurations.map((configuration) => (
                              <tr key={configuration.configurationName}>
                                <td colSpan={4} className="p-0">
                                  <details className="group/config">
                                    <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,2fr)_minmax(7rem,1fr)_minmax(14rem,1.5fr)_minmax(7rem,1fr)] items-center gap-2 px-3 py-2 hover:bg-[var(--surface)] [&::-webkit-details-marker]:hidden">
                                      <span className="flex min-w-0 items-center gap-2 text-[var(--text)]" title={configuration.configurationName}>
                                        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform group-open/config:rotate-90" />
                                        <span className="truncate">{configuration.configurationName}</span>
                                      </span>
                                      <span className="tabular-nums text-[var(--text)]">{configuration.totalTestCount}</span>
                                      <span className="tabular-nums text-[var(--text)]">
                                        {formatDuration(configuration.totalSeconds)}
                                        {configuration.excludedTestCount > 0 && (
                                          <span className="ml-2 text-[var(--text-muted)]">({configuration.excludedTestCount} without timestamps)</span>
                                        )}
                                      </span>
                                      <span className="tabular-nums text-[var(--text)]">{formatDays(configuration.totalSeconds)}</span>
                                    </summary>
                                    <div className="border-t border-[var(--border)] bg-black/10 px-3 py-2">
                                      <table className="w-full text-left text-xs">
                                        <thead className="text-[var(--text-muted)]">
                                          <tr>
                                            <th className="px-3 py-2 font-semibold">Test name</th>
                                            <th className="px-3 py-2 font-semibold">State</th>
                                            <th className="px-3 py-2 font-semibold">Execution time</th>
                                            <th className="px-3 py-2 font-semibold">Days</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                          {configuration.tests.map((test, index) => (
                                            <tr key={`${test.testName}-${index}`}>
                                              <td className="max-w-[32rem] px-3 py-1.5 text-[var(--text)]" title={test.testName}>{test.testName}</td>
                                              <td className="px-3 py-1.5 text-[var(--text-muted)]">{test.state}</td>
                                              <td className="px-3 py-1.5 tabular-nums text-[var(--text)]">{test.seconds == null ? "No timestamps" : formatDuration(test.seconds)}</td>
                                              <td className="px-3 py-1.5 tabular-nums text-[var(--text)]">{test.seconds == null ? "-" : formatDays(test.seconds)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot className="border-t-2 border-[var(--border)] font-semibold text-[var(--text)]">
                                          <tr>
                                            <td className="px-3 py-2">Total ({configuration.totalTestCount} tests)</td>
                                            <td className="px-3 py-2" />
                                            <td className="px-3 py-2 tabular-nums">{formatMinutes(configuration.totalSeconds)}</td>
                                            <td className="px-3 py-2 tabular-nums">{formatDays(configuration.totalSeconds)}</td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                  </details>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
  );
}