"use client";

import { useEffect, useState } from "react";
import { CalendarDays, FileText } from "lucide-react";
import type { FailureRow, Stage, StageDetail, WeeklyReport } from "@/lib/weekly-report";
import { getWorkWeeks } from "@/lib/work-weeks";

const offsetMs = 330 * 60_000;
const today = () => new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
const sevenDaysAgo = () => new Date(Date.now() + offsetMs - 6 * 86_400_000).toISOString().slice(0, 10);
const percentage = (count: number, total: number) => total ? `${(count / total * 100).toFixed(1)}%` : "0%";
const reportPercentage = (count: number, total: number) => percentage(count, total).replace(/\.0%$/, "%");
const timeLabel = (value: string) => new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
}).format(new Date(value));
const stageNames: Record<Stage, string> = {
  Preboot: "PreBoot", RebootStation: "Reboot station", PreTest: "PreTest", Test: "Test", PostTest: "PostTest", Cleanup: "Cleanup", Other: "Other",
};
const breakdownStages: Stage[] = ["Preboot", "PreTest", "Test", "PostTest", "Cleanup"];
const groupWords: Record<string, string> = { io: "IO", ras: "RAS", serio: "Serial", pcie: "PCIe", pm: "PM", rdt: "RDT", ace: "ACE" };
const formatValidationGroup = (group: string) => group.replace(/^pv_/i, "").split("_")
  .filter(Boolean)
  .map((word) => groupWords[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  .join(" ");

function Breakdown({ title, rows }: { title: string; rows: FailureRow[] }) {
  const totals = rows.reduce((result, row) => {
    for (const stage of Object.keys(row.stages) as Stage[]) result.stages[stage] += row.stages[stage];
    result.total += row.total;
    result.attached += row.attached;
    return result;
  }, { stages: { Preboot: 0, RebootStation: 0, PreTest: 0, Test: 0, PostTest: 0, Cleanup: 0, Other: 0 }, total: 0, attached: 0 });
  const hiddenStages = totals.stages.RebootStation + totals.stages.Other;
  return (
    <section className="border-t border-[#d4e0eb] px-5 py-6 sm:px-7">
      <h2 className="mb-1 text-base font-bold text-[#204e76]">{title}</h2>
      <p className="mb-4 text-xs leading-relaxed text-[#57718a]">Failure records, not distinct test lines. Sighting attachment counts are not sighting-status counts.{hiddenStages > 0 && ` Total also includes ${hiddenStages} Reboot station/other failures.`}</p>
      <div className="overflow-x-auto border border-[#b8cadb]">
        <table className="w-full min-w-[700px] border-collapse text-left text-sm">
          <thead className="bg-[#204e76] text-xs font-semibold text-white">
            <tr>
              {["Validation Group", "PreBoot", "PreTest", "Test", "PostTest", "Cleanup", "Total", "Sighting IDs Attached"].map((label) => (
                <th key={label} className="border-r border-white/20 px-3 py-3 last:border-0">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#cfdae5]">
            {rows.map((row) => (
              <tr key={row.group} className="bg-white even:bg-[#edf3f9]">
                <th className="px-3 py-2.5 font-semibold text-[#244c70]">{formatValidationGroup(row.group)}</th>
                {breakdownStages.map((stage) => (
                  <td key={stage} className={`px-3 py-2.5 tabular-nums ${row.stages[stage] ? "font-medium text-[#bb3846]" : "text-[#72869a]"}`}>{row.stages[stage]}</td>
                ))}
                <td className="px-3 py-2.5 font-bold tabular-nums text-[#204e76]">{row.total}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums text-[#087a78]">{row.attached}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="bg-white px-3 py-6 text-center text-[#647e94]">No failed runs.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-[#94aec6] bg-[#dce8f4] font-bold text-[#173f60]">
              <tr>
                <th className="px-3 py-2 text-left">Total</th>
                {breakdownStages.map((stage) => (
                  <td key={stage} className="px-3 py-2 tabular-nums">{totals.stages[stage]}</td>
                ))}
                <td className="px-3 py-2 tabular-nums">{totals.total}</td>
                <td className="px-3 py-2 tabular-nums text-[#087a78]">{totals.attached}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function StageSection({ stage, details }: { stage: Stage; details: StageDetail[] }) {
  const rows = details.filter((detail) => detail.stage === stage);
  if (!rows.length) return null;
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  const total = details.reduce((sum, row) => sum + row.count, 0);
  const affectedLines = new Set(rows.map((row) => row.testLine)).size;
  const byConfig = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const groups = byConfig.get(row.config) ?? new Map<string, number>();
    groups.set(row.group, (groups.get(row.group) ?? 0) + row.count);
    byConfig.set(row.config, groups);
  }
  return (
    <section className="border-t border-[#d4e0eb] px-5 py-6 sm:px-7">
      <h2 className="text-base font-bold text-[#204e76]">{stageNames[stage]} stage failures</h2>
      <p className="mt-1 text-sm text-[#4f6980]"><strong className="text-[#bb3846]">{percentage(count, total)}</strong> of window failures ({count} of {total} records), affecting {affectedLines} test lines.</p>
      <div className="mt-4 overflow-x-auto border border-[#b8cadb]">
        <table className="w-full min-w-[540px] text-left text-sm">
          <thead className="bg-[#204e76] text-xs font-semibold text-white"><tr>
            <th className="border-r border-white/20 px-3 py-3">Configuration</th><th className="px-3 py-3">Failures by Validation Group</th>
          </tr></thead>
          <tbody className="divide-y divide-[#cfdae5]">
            {[...byConfig.entries()].map(([config, groups], index) => (
              <tr key={config} className={index % 2 ? "bg-[#edf3f9]" : "bg-white"}><td className="max-w-md break-words px-3 py-2.5 font-medium text-[#244c70]">{config}</td>
                <td className="px-3 py-2.5 text-[#bb3846]">{[...groups.entries()].map(([group, value]) => `${formatValidationGroup(group)}: ${value}`).join(" · ")}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-3 text-sm text-[#204e76]">
        <summary className="cursor-pointer font-semibold">Failed steps ({rows.length} grouped entries)</summary>
        <div className="mt-2 max-h-64 overflow-auto border-l-2 border-[#9ab6ce] pl-4 text-[#253646]">
          {rows.map((row) => (
            <p key={JSON.stringify([row.config, row.testLine, row.step, row.subState, row.group])} className="py-1.5">
              <strong>{row.count}× {row.step}</strong> · {row.subState} · {formatValidationGroup(row.group)}
              <span className="block break-words text-xs text-[#60788e]">{row.testLine}</span>
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}

export default function WeeklyReportBuilder() {
  const [fromDate, setFromDate] = useState(sevenDaysAgo);
  const [toDate, setToDate] = useState(today);
  const [fromTime, setFromTime] = useState("00:00");
  const [toTime, setToTime] = useState("23:59");
  const [mode, setMode] = useState<"dateRange" | "workWeek">("dateRange");
  const [modeReady, setModeReady] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState("");
  const [suiteInput, setSuiteInput] = useState("");
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [generatedWeek, setGeneratedWeek] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/dashboard", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load Weekly Report settings.");
        return response.json() as Promise<{ weeklyReportMode?: string }>;
      })
      .then((settings) => {
        if (!cancelled) {
          setMode(settings.weeklyReportMode === "workWeek" ? "workWeek" : "dateRange");
          setModeReady(true);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load Weekly Report settings.");
      });
    return () => { cancelled = true; };
  }, []);

  const workWeeks = getWorkWeeks();
  const activeWeek = workWeeks.weeks.find((option) => option.label === selectedWeek) ?? workWeeks.weeks[0];

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const from = mode === "dateRange" ? new Date(Date.parse(`${fromDate}T${fromTime}:00Z`) - offsetMs) : activeWeek.from;
    const to = mode === "dateRange" ? new Date(Date.parse(`${toDate}T${toTime}:00Z`) - offsetMs + 60_000) : activeWeek.to;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      setError("Choose an end date and time after the start.");
      return;
    }
    const suites = [...new Set(suiteInput.split(/\r?\n/).map((name) => name.trim()).filter(Boolean))];
    setBusy(true);
    try {
      const response = await fetch("/api/weekly-report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, from: mode === "dateRange" ? from.toISOString() : undefined, to: mode === "dateRange" ? to.toISOString() : undefined, week: mode === "workWeek" ? activeWeek.label : undefined, suites: suites.length ? suites : undefined }),
      });
      const result = (await response.json()) as WeeklyReport & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not create the report.");
      setReport(result);
      setGeneratedWeek(mode === "workWeek" ? `${workWeeks.year}${activeWeek.label}` : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the report.");
    } finally {
      setBusy(false);
    }
  };

  const control = "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm text-[var(--text)]";
  const attempted = report ? report.latestPassed + report.latestFailed + report.latestRerunPendingRunning : 0;
  return (
    <div className="mx-auto max-w-7xl text-[var(--text)]">
      <div className="mb-5 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
        <h1 className="text-lg font-semibold">Weekly Report</h1>
      </div>
      <form onSubmit={(event) => void create(event)} className="border-y border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <fieldset disabled={mode !== "dateRange"} className={`flex flex-wrap items-end gap-3 ${mode !== "dateRange" ? "opacity-50" : ""}`}>
          <label className="min-w-36 flex-1 text-xs font-semibold text-[var(--text-muted)]">From (IST)
            <input required type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} className={`mt-1 ${control}`} />
          </label>
          <label className="w-32 text-xs font-semibold text-[var(--text-muted)]">Time
            <input required type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)} className={`mt-1 ${control}`} />
          </label>
          <label className="min-w-36 flex-1 text-xs font-semibold text-[var(--text-muted)]">To (IST)
            <input required type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} className={`mt-1 ${control}`} />
          </label>
          <label className="w-32 text-xs font-semibold text-[var(--text-muted)]">Time
            <input required type="time" value={toTime} onChange={(event) => setToTime(event.target.value)} className={`mt-1 ${control}`} />
          </label>
        </fieldset>
        <div className={`mt-4 flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-4 ${mode !== "workWeek" ? "opacity-50" : ""}`}>
          <label className="w-40 text-xs font-semibold text-[var(--text-muted)]">Work Week ({workWeeks.year})
            <select value={activeWeek.label} disabled={mode !== "workWeek"} onChange={(event) => setSelectedWeek(event.target.value)} className={`mt-1 ${control}`}>
              {workWeeks.weeks.map((week) => <option key={week.label} value={week.label}>{week.label}</option>)}
            </select>
          </label>
          {mode === "workWeek" && <span className="pb-2 text-xs text-[var(--text-muted)]">{timeLabel(activeWeek.from.toISOString())} – {timeLabel(new Date(activeWeek.to.getTime() - 1).toISOString())} IST</span>}
        </div>
        <details className="mt-3 text-xs text-[var(--text-muted)]">
          <summary className="cursor-pointer">Suites: B0 P1 + P2</summary>
          <label className="mt-2 block max-w-3xl">Custom NGAi suite names (one per line; leave empty for B0 P1 + P2)
            <textarea value={suiteInput} onChange={(event) => setSuiteInput(event.target.value)} rows={2} className={`mt-1 ${control}`} />
          </label>
        </details>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={busy || !modeReady} className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] disabled:opacity-60">
            <FileText className="h-4 w-4" aria-hidden="true" />{busy ? "Creating…" : "Create report"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </form>

      {!report && !busy && <p className="py-12 text-center text-sm text-[var(--text-muted)]">No report for the selected dates yet.</p>}
      {report && <article className="mt-6 border border-[#c1d3e2] bg-white text-[#253646] shadow-sm">
        <header className="border-l-4 border-[#204e76] px-5 py-5 sm:px-7">
          <p className="text-base font-semibold text-[#204e76]">
            {generatedWeek && <>{generatedWeek} · </>}
            {timeLabel(report.from)} – {timeLabel(new Date(Date.parse(report.to) - 1).toISOString())} IST
          </p>
          <p className="mt-4 border-l-[3px] border-[#d7a02b] bg-[#fff6d6] px-3 py-2 text-sm leading-relaxed text-[#594416]">
            <strong>Note:</strong> This report was generated with AI assistance. The updates have been reviewed for accuracy.
          </p>
          <div className="mt-4 space-y-2">
            {report.suites.map((suite, index) => (
              <div key={suite} className="flex items-start gap-3 text-sm">
                <span className="w-14 shrink-0 font-semibold text-[#204e76]">Suite {index + 1}</span>
                <span className="min-w-0 break-all text-[#435f78]">{suite}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[#60788e]">Generated {timeLabel(report.generatedAt)} IST</p>
        </header>

        <section className="border-t border-[#d4e0eb] px-5 py-6 sm:px-7">
          <h3 className="mb-4 text-base font-bold text-[#204e76]">Execution Summary</h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 border-y border-[#c4d6e5] bg-[#eef4fa] px-3 py-4 sm:grid-cols-3 xl:grid-cols-5">
            {[
              ["Execution Attempted", attempted.toLocaleString(), percentage(attempted, report.planned), "text-[#204e76]", "border-[#204e76]"],
              ["Test Passed", report.latestPassed.toLocaleString(), percentage(report.latestPassed, report.planned), "text-[#087a50]", "border-[#087a50]"],
              ["Test Failed", report.latestFailed.toLocaleString(), percentage(report.latestFailed, report.planned), "text-[#bb3846]", "border-[#bb3846]"],
              ["Test Blocked", report.blockedLines.toLocaleString(), percentage(report.blockedLines, report.planned), "text-[#aa5420]", "border-[#aa5420]"],
              ["Not run", report.latestNotRun.toLocaleString(), percentage(report.latestNotRun, report.planned), "text-[#9a6313]", "border-[#c1852c]"],
            ].map(([label, count, percent, color, border]) => (
              <div key={label} className={`border-l-[3px] pl-3 ${border}`}>
                <p className="text-xs font-medium text-[#4e6c84]">
                  {label}
                  {label === "Execution Attempted" && <> <span className="ml-1 text-[11px] font-normal text-[#60788e]">(pass + fail + rerun created)</span></>}
                </p>
                <p className={`mt-1 flex flex-wrap items-baseline gap-x-2 font-bold tabular-nums ${color}`}>
                  <span className="text-xl">{count}</span>
                  <span className="text-sm font-semibold">{percent}</span>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-[#60788e]">Execution Attempted includes {report.latestRerunPendingRunning} PendingRunning reruns (index &gt; 0); those tests also appear in the current Not run count.</p>
          <h4 className="mt-5 text-sm font-bold text-[#204e76]">DMR-AP1 B0 Execution Status Summary</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#253646]">
            <li><strong>{reportPercentage(attempted, report.planned)}</strong> tests have been attempted, with <strong className="text-[#087a50]">{reportPercentage(report.latestPassed, report.planned)} passed</strong>, <strong className="text-[#bb3846]">{reportPercentage(report.latestFailed, report.planned)} failed</strong> and <strong className="text-[#aa5420]">{reportPercentage(report.blockedLines, report.planned)} blocked</strong>.</li>
            <li>Failure analysis and rerun in progress.</li>
            <li>Execution is currently running with <strong className="text-black">BKC#40</strong>.</li>
          </ul>
          <h4 className="mt-5 text-sm font-bold text-[#204e76]">Links</h4>
          <ul className="mt-2 list-disc pl-5 text-sm">
            <li><a href="https://xve-dashboards.intel.com/dmr-ap/execution-summary" target="_blank" rel="noopener noreferrer" className="font-medium text-[#205d92] underline underline-offset-2 hover:text-[#123b60]">PV VV Exec Summary Dashboard</a></li>
          </ul>
        </section>

        <Breakdown title="Overall stage-wise / validation group-wise failure breakdown · Current suite backlog" rows={report.backlogFailures} />
        <Breakdown title="Stage-wise / validation group-wise failure breakdown · Selected window" rows={report.windowFailures} />
        {(["Preboot", "RebootStation", "PreTest", "Test", "PostTest", "Cleanup", "Other"] as Stage[]).map((stage) => (
          <StageSection key={stage} stage={stage} details={report.stageDetails} />
        ))}
      </article>}
    </div>
  );
}