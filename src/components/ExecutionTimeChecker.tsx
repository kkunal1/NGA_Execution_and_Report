"use client";

import { FormEvent, useState } from "react";
import type { ExecutionTimeSummary } from "@/lib/execution-time";

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

export default function ExecutionTimeChecker() {
  const [suiteName, setSuiteName] = useState("");
  const [summaries, setSummaries] = useState<ExecutionTimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedSuite, setSearchedSuite] = useState("");

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
      setSummaries(data.summaries ?? []);
      setSearchedSuite(data.suiteName ?? suiteName.trim());
    } catch (cause) {
      setSummaries([]);
      setError(cause instanceof Error ? cause.message : "Could not calculate execution time.");
    } finally {
      setLoading(false);
    }
  };

  return (
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
        </form>
      </div>

      {error && <p className="px-5 py-6 text-sm text-red-600">{error}</p>}
      {!loading && !error && searchedSuite && summaries.length === 0 && (
        <p className="px-5 py-8 text-sm text-[var(--text-muted)]">No execution records found for this suite.</p>
      )}
      {summaries.length > 0 && (
        <div className="overflow-auto">
          <div className="border-b border-[var(--border)] px-5 py-3 text-sm text-[var(--text-muted)]">
            Suite: <span className="font-medium text-[var(--text)]">{searchedSuite}</span>
          </div>
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
                    <details>
                      <summary className="grid cursor-pointer list-inside grid-cols-[minmax(0,2fr)_minmax(7rem,1fr)_minmax(14rem,1.5fr)_minmax(7rem,1fr)] items-center gap-2 px-5 py-3 hover:bg-[var(--surface)]">
                        <span className="truncate font-medium text-[var(--text)]">{summary.subsystemName}</span>
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
                                <td className="max-w-[28rem] px-3 py-2 text-[var(--text)]" title={configuration.configurationName}>{configuration.configurationName}</td>
                                <td className="px-3 py-2 tabular-nums text-[var(--text)]">{configuration.totalTestCount}</td>
                                <td className="px-3 py-2 tabular-nums text-[var(--text)]">
                                  {formatDuration(configuration.totalSeconds)}
                                  {configuration.excludedTestCount > 0 && (
                                    <span className="ml-2 text-[var(--text-muted)]">({configuration.excludedTestCount} without timestamps)</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 tabular-nums text-[var(--text)]">{formatDays(configuration.totalSeconds)}</td>
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
        </div>
      )}
    </section>
  );
}