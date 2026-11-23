"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, Download, Search } from "lucide-react";
import type { ExecutionDataResult } from "@/lib/execution-data";
import { formatValidationGroupName } from "@/lib/normalize";
import { formatExecutionCategoryCounts, formatExecutionDays, groupDomainExecutionCategories, groupExecutionSystemsByConfig, type ExecutionCategoryTest } from "@/lib/execution-data-view";
import { buildExecutionDataHtml, executionDataHtmlFilename } from "@/lib/execution-data-export";

type Cycle = { id: string; name: string; suiteNames: string[] };
type Selection = { cycleId: string; suiteName?: string };
type SavedExecutionData = { selection: string; resultLabel: string; result: ExecutionDataResult };

const EXECUTION_DATA_STATE_KEY = "nga-execution-data-state";
let cachedExecutionData: SavedExecutionData | null = null;
let latestRequest = 0;

function saveExecutionData(data: SavedExecutionData) {
  cachedExecutionData = data;
  try {
    window.sessionStorage.setItem(EXECUTION_DATA_STATE_KEY, JSON.stringify(data));
  } catch {
    try { window.sessionStorage.removeItem(EXECUTION_DATA_STATE_KEY); } catch {}
  }
}

function restoreExecutionData(): SavedExecutionData | null {
  if (cachedExecutionData) return cachedExecutionData;
  try {
    const raw = window.sessionStorage.getItem(EXECUTION_DATA_STATE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedExecutionData;
    if (typeof saved.selection !== "string" || typeof saved.resultLabel !== "string" || !saved.result
      || !Array.isArray(saved.result.domains) || !Array.isArray(saved.result.systems) || !Array.isArray(saved.result.warnings)
      || ![saved.result.totalTests, saved.result.totalAttempts, saved.result.totalSeconds, saved.result.missingDurations, saved.result.unknownSystemAttempts, saved.result.unknownStationAttempts].every(Number.isFinite)
      || !saved.result.domains.every((domain) => Array.isArray(domain.tests) && Array.isArray(domain.systems) && domain.tests.every((test) => Array.isArray(test.attempts) && Array.isArray(test.systems)))) return null;
    cachedExecutionData = saved;
    return saved;
  } catch {
    return null;
  }
}

function duration(seconds: number) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  return `${hours.toLocaleString()}h ${minutes}m ${total % 60}s`;
}

function timestamp(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date) : "-";
}

function AttemptTests({ items }: { items: ExecutionCategoryTest[] }) {
  return <div>{items.map(({ test, attempts }) => {
    const systems = new Set(attempts.map((attempt) => attempt.systemId ? `id:${attempt.systemId.toLowerCase()}` : attempt.systemName ? `name:${attempt.systemName.toLowerCase()}` : "").filter(Boolean));
    const totalSeconds = attempts.reduce((sum, attempt) => sum + (attempt.seconds ?? 0), 0);
    return <details key={`${test.suite}-${test.id}`} className="group/test border-b border-[var(--border)] last:border-b-0">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"><ChevronRight className="h-4 w-4 shrink-0 group-open/test:rotate-90" aria-hidden="true" /><span className="min-w-48 flex-1 break-all font-medium">{test.name}</span><span>{attempts.length} runs</span><span>{systems.size} systems</span><span className="tabular-nums">{duration(totalSeconds)}</span></summary>
      <div className="overflow-x-auto border-t border-[var(--border)]"><p className="break-all px-4 py-2 text-xs text-[var(--text-muted)]">{test.suite} | Test line ID: {test.id}</p><table className="w-full min-w-[960px] text-left text-xs"><thead className="bg-[var(--surface-alt)] text-[var(--text-muted)]"><tr><th className="px-4 py-2">Run ID</th><th className="px-4 py-2">Rerun index</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">System</th><th className="px-4 py-2">Station</th><th className="px-4 py-2">Start (IST)</th><th className="px-4 py-2">End (IST)</th><th className="px-4 py-2">Duration</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.runId} className="border-t border-[var(--border)]"><td className="break-all px-4 py-2">{attempt.runId}</td><td className="px-4 py-2">{attempt.rerunIndex ?? "-"}</td><td className="px-4 py-2">{attempt.state}</td><td className="break-all px-4 py-2">{attempt.systemName ?? "Unknown"}</td><td className="break-all px-4 py-2">{attempt.stationName ?? "Unknown"}</td><td className="whitespace-nowrap px-4 py-2">{timestamp(attempt.start)}</td><td className="whitespace-nowrap px-4 py-2">{timestamp(attempt.end)}</td><td className="whitespace-nowrap px-4 py-2">{attempt.seconds === null ? "Unavailable" : duration(attempt.seconds)}</td></tr>)}</tbody></table></div>
    </details>;
  })}</div>;
}

export default function ExecutionDataPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selection, setSelection] = useState("");
  const [result, setResult] = useState<ExecutionDataResult | null>(null);
  const [resultLabel, setResultLabel] = useState("");
  const [loadingCycles, setLoadingCycles] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const validSelection = cycles.some((cycle) => selection === JSON.stringify({ cycleId: cycle.id })
    || cycle.suiteNames.some((suiteName) => selection === JSON.stringify({ cycleId: cycle.id, suiteName })));
  const systemGroups = result ? groupExecutionSystemsByConfig(result) : [];
  const hasCachedWithoutConfig = result?.domains.some((domain) => domain.tests.some((test) => test.attempts.some((attempt) => !Object.prototype.hasOwnProperty.call(attempt, "configName")))) ?? false;
  const knownConfigCount = systemGroups.filter((group) => group.configName !== "Unknown configuration").length;
  const busiestDomain = result?.domains.reduce<(typeof result.domains)[number] | null>((busiest, domain) => !busiest || domain.attempts > busiest.attempts ? domain : busiest, null);
  const resultCycle = cycles.find((cycle) => cycle.name === resultLabel || cycle.suiteNames.includes(resultLabel));
  const resultSuiteNames = result?.suiteNames ?? (resultCycle?.suiteNames.includes(resultLabel) ? [resultLabel] : resultCycle?.suiteNames ?? []);
  const domainCategories = result?.domains.map((domain) => ({ domain, categories: groupDomainExecutionCategories(domain) })) ?? [];
  const manualAttempts = domainCategories.reduce((total, { categories }) => total + categories.manualUnverified.reduce((count, item) => count + item.attempts.length, 0), 0);
  const unmappedAttempts = domainCategories.reduce((total, { categories }) => total + categories.unknown.reduce((count, item) => count + item.attempts.length, 0), 0);

  useEffect(() => {
    const saved = restoreExecutionData();
    if (!saved) return;
    setSelection(saved.selection);
    setResult(saved.result);
    setResultLabel(saved.resultLabel);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/execution-data", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { cycles?: Cycle[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load execution cycles.");
      setCycles(data.cycles ?? []);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load execution cycles."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingCycles(false); });
    return () => controller.abort();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validSelection) return;
    const selected = JSON.parse(selection) as Selection;
    const cycle = cycles.find((item) => item.id === selected.cycleId);
    const requestId = ++latestRequest;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/execution-data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(selected) });
      const data = await response.json() as { result?: ExecutionDataResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "Could not load execution data.");
      if (requestId !== latestRequest) return;
      const label = selected.suiteName ?? cycle?.name ?? "Selected cycle";
      saveExecutionData({ selection, resultLabel: label, result: data.result });
      setResult(data.result);
      setResultLabel(label);
    } catch (cause) {
      if (requestId === latestRequest) setError(cause instanceof Error ? cause.message : "Could not load execution data.");
    } finally { if (requestId === latestRequest) setLoading(false); }
  };

  const downloadHtml = () => {
    if (!result) return;
    try {
      const html = buildExecutionDataHtml(result, resultLabel, resultSuiteNames);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = executionDataHtmlFilename(resultLabel);
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download execution data.");
    }
  };

  return <main className="mx-auto max-w-7xl text-[var(--text)]">
    <h1 className="mb-5 text-lg font-semibold">Check Execution Data</h1>
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-3 border-y border-[var(--border)] bg-[var(--surface)] p-4">
      <label className="w-full max-w-xl text-xs font-semibold text-[var(--text-muted)]">Execution cycle or suite
        <select value={validSelection ? selection : ""} onChange={(event) => { const next = event.target.value; setSelection(next); if (cachedExecutionData) saveExecutionData({ ...cachedExecutionData, selection: next }); setError(""); }} disabled={loadingCycles || loading} className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]">
          <option value="">{loadingCycles ? "Loading cycles..." : "Select a cycle or suite"}</option>
          {cycles.map((cycle) => <optgroup key={cycle.id} label={`CYCLE | ${cycle.name}`} className="font-semibold text-[var(--text)]">
            <option value={JSON.stringify({ cycleId: cycle.id })} className="font-semibold text-[var(--text)]">ALL SUITES | {cycle.name}</option>
            {cycle.suiteNames.map((suiteName) => <option key={suiteName} value={JSON.stringify({ cycleId: cycle.id, suiteName })} className="font-mono font-normal text-[var(--text-muted)]">SUITE | {suiteName}</option>)}
          </optgroup>)}
        </select>
      </label>
      <button type="submit" disabled={!validSelection || loading} className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] disabled:opacity-60"><Search className="h-4 w-4" aria-hidden="true" />{loading ? "Loading..." : "Submit"}</button>
      <button type="button" onClick={downloadHtml} disabled={!result || loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-alt)] disabled:opacity-60"><Download className="h-4 w-4" aria-hidden="true" />Download HTML</button>
    </form>
    {loading && <p role="status" className="py-6 text-sm text-[var(--text-muted)]">Loading historical runs...</p>}
    {error && <p role="alert" className="py-5 text-sm text-red-500">{error}</p>}
    {result && <div className="mt-5">
      <h2 className="break-all text-base font-semibold">{resultLabel}</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">All started runs, including reruns and triage runs. Time is summed across completed runs, so parallel execution overlaps.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--border)] py-4 sm:grid-cols-3 lg:grid-cols-5">
        {[["Test lines", result.totalTests.toLocaleString()], ["Run attempts", result.totalAttempts.toLocaleString()], ["Known systems", result.systems.length.toLocaleString()], ["Total execution time", duration(result.totalSeconds)], ["Total execution days", formatExecutionDays(result.totalSeconds)]].map(([label, amount]) => <div key={label} className="min-w-0 border-l-2 border-[var(--accent)] pl-3"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="mt-1 break-words text-lg font-semibold tabular-nums">{amount}</p></div>)}
      </div>
      <section aria-labelledby="execution-overview-heading" className="mt-4 border-l-2 border-[var(--accent)] bg-[var(--surface)] px-4 py-3">
        <h3 id="execution-overview-heading" className="text-sm font-semibold">Execution overview</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--text-muted)]">
          <li className="break-words [overflow-wrap:anywhere]"><strong className="text-[var(--text)]">Test cycle:</strong> {resultSuiteNames.length ? resultSuiteNames.join("; ") : resultLabel}.</li>
          <li>{result.plannedConfigurations ? <>{result.plannedConfigurations.missingTestLines > 0 ? "At least " : ""}<strong className="text-[var(--text)]">{result.plannedConfigurations.count.toLocaleString()}</strong> planned {result.plannedConfigurations.count === 1 ? "configuration" : "configurations"} across the selected test lines{result.plannedConfigurations.missingTestLines > 0 ? `; ${result.plannedConfigurations.missingTestLines.toLocaleString()} test lines have no configuration data` : ""}.</> : "Planned configuration count is unavailable. Submit again to load it."}</li>
          {result.totalAttempts ? <>
          <li><strong className="text-[var(--text)]">{result.totalAttempts.toLocaleString()}</strong> {result.totalAttempts === 1 ? "execution attempt was" : "execution attempts were"} recorded across <strong className="text-[var(--text)]">{result.totalTests.toLocaleString()}</strong> {result.totalTests === 1 ? "test line" : "test lines"}, including reruns and triage runs.</li>
          <li>{result.systems.length ? <><strong className="text-[var(--text)]">{result.systems.length.toLocaleString()}</strong> distinct {result.systems.length === 1 ? "system was" : "systems were"} identified{knownConfigCount ? <> across <strong className="text-[var(--text)]">{knownConfigCount.toLocaleString()}</strong> known {knownConfigCount === 1 ? "configuration" : "configurations"}</> : "; configuration details are unavailable"}.</> : "No systems could be identified from the available mappings."}</li>
          <li>Completed runs contributed <strong className="text-[var(--text)]">{duration(result.totalSeconds)}</strong> ({formatExecutionDays(result.totalSeconds)}) of cumulative execution time. Parallel runs may overlap.</li>
          {busiestDomain && busiestDomain.attempts > 0 && <li><strong className="text-[var(--text)]">{formatValidationGroupName(busiestDomain.name)}</strong> had the most recorded attempts ({busiestDomain.attempts.toLocaleString()}).</li>}
          <li><strong className="text-[var(--text)]">{manualAttempts.toLocaleString()}</strong> {manualAttempts === 1 ? "execution attempt is" : "execution attempts are"} listed under manual execution; system details are unavailable and individual execution times are not shown.</li>
          {unmappedAttempts > 0 && <li>{unmappedAttempts.toLocaleString()} {unmappedAttempts === 1 ? "attempt has" : "attempts have"} station information but no unique system mapping.</li>}
          {result.missingDurations > 0 && <li>{result.missingDurations.toLocaleString()} {result.missingDurations === 1 ? "attempt has" : "attempts have"} incomplete or invalid timestamps and {result.missingDurations === 1 ? "is" : "are"} excluded from duration totals.</li>}
          </> : <li>No started execution attempts were found for this selection.</li>}
        </ul>
      </section>
      {result.warnings.map((warning) => <p role="alert" key={warning} className="mt-2 text-sm text-amber-500">{warning}</p>)}
      <details className="mt-4 border border-[var(--border)] bg-[var(--surface)]"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Used systems ({result.systems.length})</summary><div className="border-t border-[var(--border)] px-4 py-3 text-sm"><p className="mb-2 text-xs text-[var(--text-muted)]">Configurations and systems are mapped from NGAi stations at query time; historical mappings may have changed.</p>{hasCachedWithoutConfig && <p role="status" className="mb-3 text-xs text-[var(--text-muted)]">This saved result has no configuration details. Submit again to load them.</p>}{systemGroups.length ? <div className="overflow-x-auto border border-[var(--border)]"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-[var(--surface-alt)] text-[var(--text-muted)]"><tr><th scope="col" className="w-2/5 px-3 py-2.5">Configuration</th><th scope="col" className="px-3 py-2.5">Systems</th><th scope="col" className="w-24 px-3 py-2.5 text-right">Count</th></tr></thead><tbody>{systemGroups.map((group) => <tr key={group.configName} className="border-t border-[var(--border)] align-top"><th scope="row" className="break-all px-3 py-3 font-medium">{group.configName}</th><td className="px-3 py-3"><ul className="flex flex-wrap gap-x-4 gap-y-1">{group.systems.map((system) => <li key={system.key} className="break-all">{system.name}</li>)}</ul></td><td className="px-3 py-3 text-right tabular-nums">{group.systems.length}</td></tr>)}</tbody></table></div> : <p className="text-[var(--text-muted)]">No system mappings available.</p>}</div></details>
      {!result.domains.length && <p className="py-8 text-sm text-[var(--text-muted)]">No started runs found for this selection.</p>}
      <div className="mt-4 space-y-3">{domainCategories.map(({ domain, categories }) => <details key={domain.name} className="group border border-[var(--border)] bg-[var(--surface)]">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"><ChevronRight className="h-4 w-4 shrink-0 group-open:rotate-90" aria-hidden="true" /><strong className="min-w-40 flex-1 break-words">{formatValidationGroupName(domain.name)}</strong><span>{domain.tests.length} tests</span><span>{domain.attempts} runs</span><span>{domain.systems.length} systems</span><span className="font-semibold tabular-nums">{duration(domain.totalSeconds)}</span>{domain.missingDurations > 0 && <span className="text-xs text-[var(--text-muted)]">{domain.missingDurations} incomplete durations</span>}</summary>
        <div className="border-t border-[var(--border)]">
          <details className="group/category border-b border-[var(--border)]"><summary className="flex cursor-pointer flex-wrap items-center gap-2 bg-[var(--surface-alt)] px-4 py-3 text-sm font-medium"><ChevronRight className="h-4 w-4 shrink-0 group-open/category:rotate-90" aria-hidden="true" />Executed on NGA <span className="ml-auto text-xs text-[var(--text-muted)]">{formatExecutionCategoryCounts(categories.nga)}</span></summary>{categories.nga.length ? <AttemptTests items={categories.nga} /> : <p className="px-4 py-3 text-sm text-[var(--text-muted)]">No mapped runs.</p>}</details>
          <details className="group/category border-b border-[var(--border)]"><summary className="flex cursor-pointer flex-wrap items-center gap-2 bg-[var(--surface-alt)] px-4 py-3 text-sm font-medium"><ChevronRight className="h-4 w-4 shrink-0 group-open/category:rotate-90" aria-hidden="true" />Manually Executed (unverified) <span className="ml-auto text-xs text-[var(--text-muted)]">{formatExecutionCategoryCounts(categories.manualUnverified)}</span></summary><p className="px-4 pt-3 text-xs text-[var(--text-muted)]">These runs have no station information; manual execution is not independently verified.</p>{categories.manualUnverified.length ? <ul className="list-disc space-y-1 px-9 py-3 text-sm">{categories.manualUnverified.map(({ test }) => <li key={`${test.suite}-${test.id}`} className="break-all">{test.name}</li>)}</ul> : <p className="px-4 py-3 text-sm text-[var(--text-muted)]">No runs without station information.</p>}</details>
          {categories.unknown.length > 0 && <details className="group/category"><summary className="flex cursor-pointer flex-wrap items-center gap-2 bg-[var(--surface-alt)] px-4 py-3 text-sm font-medium"><ChevronRight className="h-4 w-4 shrink-0 group-open/category:rotate-90" aria-hidden="true" />System mapping unavailable <span className="ml-auto text-xs text-[var(--text-muted)]">{formatExecutionCategoryCounts(categories.unknown)}</span></summary><AttemptTests items={categories.unknown} /></details>}
        </div>
      </details>)}</div>
    </div>}
  </main>;
}