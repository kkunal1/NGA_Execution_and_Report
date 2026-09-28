"use client";

import { useEffect, useState } from "react";
import type { StepGroups, Summary, TestRow } from "@/lib/types";
import { DATA_PROVIDERS, DATA_PROVIDER_KEY, readNgaiNetworkOverride, type DataProvider } from "@/lib/provider";

const STATE_BADGE: Record<string, string> = {
  passed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-slate-200 text-slate-600",
};

function stateBadgeClass(state: string) {
  return STATE_BADGE[state.trim().toLowerCase()] ?? "bg-amber-100 text-amber-800";
}

const STEP_COLUMNS: { key: keyof StepGroups; label: string; header: string }[] = [
  { key: "PreBoot", label: "PreBoot Steps", header: "bg-blue-100 text-blue-900" },
  { key: "PostTest", label: "PostTest Steps", header: "bg-purple-100 text-purple-900" },
  { key: "Cleanup", label: "Cleanup Steps", header: "bg-amber-100 text-amber-900" },
];

export default function NewJobPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<TestRow[]>([]);
  const [steps, setSteps] = useState<StepGroups | null>(null);
  const [stepsFor, setStepsFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<DataProvider>("ngai");
  const [suiteNameInput, setSuiteNameInput] = useState("");
  const abortedCount = rows.filter((row) => row.state.trim().toLowerCase() === "aborted").length;

  useEffect(() => {
    const stored = window.localStorage.getItem(DATA_PROVIDER_KEY);
    if (stored === "sso" || stored === "ngai") setProvider(stored);
    const onStorage = (e: StorageEvent) => {
      if (e.key === DATA_PROVIDER_KEY && (e.newValue === "sso" || e.newValue === "ngai")) setProvider(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loadRecords = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(provider === "sso" ? "/api/scrape" : "/api/test-run-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          provider === "sso" ? { headless: true } : { suiteName: suiteNameInput.trim(), ...readNgaiNetworkOverride() },
        ),
      });
      const data = (await response.json()) as {
        error?: string;
        summary?: Summary;
        rows?: TestRow[];
        steps?: StepGroups;
        stepsFor?: string | null;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not load TestRun data");
      setSummary(data.summary ?? null);
      setRows(data.rows ?? []);
      setSteps(data.steps ?? null);
      setStepsFor(data.stepsFor ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("autoLoad") !== "1") return;
    void loadRecords();
    window.history.replaceState({}, "", "/new-job");
  }, [provider]);

  const maxStepRows = steps
    ? Math.max(steps.PreBoot.length, steps.PostTest.length, steps.Cleanup.length)
    : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">NGA TestRun Data</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {DATA_PROVIDERS.find((option) => option.value === provider)?.label} query records
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={suiteNameInput}
            onChange={(e) => setSuiteNameInput(e.target.value)}
            placeholder="Oak_Stream_Platform_1_DMR-Platform_Beta-PAIV-Platform-AP1_Beta_Regression_Cycle"
            className="w-80 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <button
            type="button"
            onClick={() => void loadRecords()}
            disabled={busy}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load TestRun Data"}
          </button>
        </div>
      </header>
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {summary && (
        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
          {[
            ["Total", summary.tests],
            ["Passed", summary.passed],
            ["Failed", summary.failed],
            ["Blocked", summary.blocked],
            ["In progress", summary.inProgress],
            ["Aborted", abortedCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-[var(--text)]">{value}</div>
            </div>
          ))}
        </section>
      )}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          TestRun Steps
        </h2>
        {stepsFor && <p className="mb-3 text-xs text-[var(--text-muted)]">More Info for: {stepsFor}</p>}
        {!steps && <p className="p-8 text-center text-sm text-[var(--text-muted)]">No records loaded.</p>}
        {steps && maxStepRows === 0 && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">No step details available for this run.</p>
        )}
        {steps && maxStepRows > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {STEP_COLUMNS.map((col) => (
                    <th key={col.key} className={`p-3 font-semibold ${col.header}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxStepRows }).map((_, i) => (
                  <tr key={i} className="border-t border-[var(--border)]">
                    {STEP_COLUMNS.map((col) => {
                      const step = steps[col.key][i];
                      return (
                        <td key={col.key} className="p-3 align-top text-[var(--text)]">
                          {step ? (
                            <div className="flex items-center gap-2">
                              <span>{step.name}</span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${stateBadgeClass(step.state)}`}
                              >
                                {step.state}
                              </span>
                            </div>
                          ) : (
                            ""
                          )}
                        </td>
                      );
                    })}
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
