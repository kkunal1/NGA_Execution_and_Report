"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Copy, Download, FileText, Trash2 } from "lucide-react";
import type { FailureRow, Stage, WeeklyReport } from "@/lib/weekly-report";
import { getIsoWorkWeekLabel, getWorkWeeks } from "@/lib/work-weeks";

const offsetMs = 330 * 60_000;
const WEEKLY_REPORT_STORAGE_KEY = "nga-weekly-report-current";
const DEFAULT_WEEKLY_REPORT_LINKS = [{ label: "PV VV Exec Summary Dashboard", url: "https://xve-dashboards.intel.com/dmr-ap/execution-summary" }];
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

function copyHtmlWithSelection(html: string): boolean {
  const container = document.createElement("div");
  container.contentEditable = "true";
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);
  container.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(container);
  selection?.removeAllRanges();
  selection?.addRange(range);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  selection?.removeAllRanges();
  container.remove();
  return copied;
}

function copyTextWithSelection(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-10000px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

function Breakdown({ title, rows, prebootAbortCounts, highlightFailureBreakdown = false }: { title: string; rows: FailureRow[]; prebootAbortCounts?: Record<string, number>; highlightFailureBreakdown?: boolean }) {
  const displayRows = prebootAbortCounts
    ? (() => {
        const byGroup = new Map(rows.map((row) => [row.group, row]));
        for (const group of Object.keys(prebootAbortCounts)) {
          if (!byGroup.has(group)) {
            byGroup.set(group, {
              group,
              stages: { Preboot: 0, RebootStation: 0, PreTest: 0, Test: 0, PostTest: 0, Cleanup: 0, Other: 0 },
              total: 0,
              attached: 0,
            });
          }
        }
        return [...byGroup.values()]
          .map((row) => {
            const stages = { ...row.stages, Preboot: prebootAbortCounts[row.group] ?? 0 };
            return { ...row, stages, total: Object.values(stages).reduce((sum, count) => sum + count, 0) };
          })
          .sort((a, b) => b.total - a.total || a.group.localeCompare(b.group));
      })()
    : rows;
  const totals = displayRows.reduce((result, row) => {
    for (const stage of Object.keys(row.stages) as Stage[]) result.stages[stage] += row.stages[stage];
    result.total += row.total;
    result.attached += row.attached;
    return result;
  }, { stages: { Preboot: 0, RebootStation: 0, PreTest: 0, Test: 0, PostTest: 0, Cleanup: 0, Other: 0 }, total: 0, attached: 0 });
  const hiddenStages = totals.stages.RebootStation + totals.stages.Other;
  const description = prebootAbortCounts
    ? "PreBoot counts are aborted tests stopped at the SUT/NUC collateral update steps; remaining stage counts are failure records. Sighting attachment counts are not sighting-status counts."
    : "Failure records, not distinct test lines. Sighting attachment counts are not sighting-status counts.";
  const failureBreakdownIndex = title.indexOf("failure breakdown");
  return (
    <section className="border-t border-[#d4e0eb] px-5 py-6 sm:px-7">
      <h2 className="mb-1 text-base font-bold text-[#204e76]">
        {highlightFailureBreakdown && failureBreakdownIndex >= 0 ? <>
          {title.slice(0, failureBreakdownIndex)}<span className="text-red-600">failure breakdown</span>{title.slice(failureBreakdownIndex + "failure breakdown".length)}
        </> : title}
      </h2>
      <p className="mb-4 text-xs leading-relaxed text-[#57718a]">{description}{hiddenStages > 0 && ` Total also includes ${hiddenStages} Reboot station/other failures.`}</p>
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
            {displayRows.map((row) => (
              <tr key={row.group} className="bg-white even:bg-[#edf3f9]">
                <th className="px-3 py-2.5 font-semibold text-[#244c70]">{formatValidationGroup(row.group)}</th>
                {breakdownStages.map((stage) => (
                  <td key={stage} className={`px-3 py-2.5 tabular-nums ${row.stages[stage] ? "font-medium text-[#bb3846]" : "text-[#72869a]"}`}>{row.stages[stage]}</td>
                ))}
                <td className="px-3 py-2.5 font-bold tabular-nums text-[#204e76]">{row.total}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums text-[#087a78]">{row.attached}</td>
              </tr>
            ))}
            {!displayRows.length && <tr><td colSpan={8} className="bg-white px-3 py-6 text-center text-[#647e94]">No failed runs.</td></tr>}
          </tbody>
          {displayRows.length > 0 && (
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
  const [reportReady, setReportReady] = useState(false);
  const reportElementRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [hsdesDetailsLoading, setHsdesDetailsLoading] = useState(false);
  const [hsdesDetailsError, setHsdesDetailsError] = useState("");
  const [hsdesDomainFilter, setHsdesDomainFilter] = useState("all");
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    try {
      const saved = window.sessionStorage.getItem(WEEKLY_REPORT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { report?: WeeklyReport; generatedWeek?: string | null };
        if (parsed.report && Array.isArray(parsed.report.suites) && typeof parsed.report.from === "string" && typeof parsed.report.to === "string") {
          const cachedReport = parsed.report;
          const cachedAgedIssues = Array.isArray(cachedReport.agedHsdesIssues) ? cachedReport.agedHsdesIssues : [];
          const hasSavedIssueCounts = Array.isArray(cachedReport.backlogFailures) && cachedReport.backlogFailures.some((row) => row.attached > 0);
          const needsHsdesRefresh = !Array.isArray(cachedReport.hsdesIssues) ||
            (cachedReport.hsdesIssues.length === 0 && (cachedAgedIssues.length > 0 || hasSavedIssueCounts));
          const cachedGeneratedWeek = typeof parsed.generatedWeek === "string" ? parsed.generatedWeek : null;
          setReport({
            ...cachedReport,
            links: Array.isArray(cachedReport.links) ? cachedReport.links : DEFAULT_WEEKLY_REPORT_LINKS,
            hsdesIssues: Array.isArray(cachedReport.hsdesIssues) ? cachedReport.hsdesIssues : [],
            agedHsdesIssues: cachedAgedIssues,
          });
          setGeneratedWeek(cachedGeneratedWeek);
          if (needsHsdesRefresh) {
            setHsdesDetailsLoading(true);
            void fetch("/api/weekly-report", { cache: "no-store" })
              .then(async (response) => {
                const result = (await response.json()) as Partial<Pick<WeeklyReport, "hsdesIssues" | "agedHsdesIssues">> & { error?: string };
                if (!response.ok) throw new Error(result.error || "Could not refresh the saved report's HSDES details.");
                if (!Array.isArray(result.hsdesIssues) || !Array.isArray(result.agedHsdesIssues)) {
                  throw new Error("The server did not return the full HSDES issue list. Restart or update the app, then reload this report.");
                }
                return result as Pick<WeeklyReport, "hsdesIssues" | "agedHsdesIssues">;
              })
              .then((details) => {
                if (cancelled) return;
                const refreshedReport = { ...cachedReport, ...details };
                setReport(refreshedReport);
                try {
                  window.sessionStorage.setItem(WEEKLY_REPORT_STORAGE_KEY, JSON.stringify({ report: refreshedReport, generatedWeek: cachedGeneratedWeek }));
                } catch {
                  // Keep the refreshed details visible even if the browser cannot cache them.
                }
              })
              .catch((cause: unknown) => {
                if (!cancelled) setHsdesDetailsError(cause instanceof Error ? cause.message : "Could not refresh the saved report's HSDES details.");
              })
              .finally(() => {
                if (!cancelled) setHsdesDetailsLoading(false);
              });
          }
        }
      }
    } catch {
      try {
        window.sessionStorage.removeItem(WEEKLY_REPORT_STORAGE_KEY);
      } catch {
        // Storage may be unavailable in restricted browser contexts.
      }
    } finally {
      setReportReady(true);
    }
    return () => { cancelled = true; };
  }, []);

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

  const createStyledReportDocument = () => {
    const article = reportElementRef.current;
    if (!article || !report) return null;

    const clone = article.cloneNode(true) as HTMLElement;
    const sourceElements = [article, ...Array.from(article.querySelectorAll<HTMLElement>("*"))];
    const clonedElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
    sourceElements.forEach((source, index) => {
      const computed = getComputedStyle(source);
      const target = clonedElements[index];
      for (const property of Array.from(computed)) {
        target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
      }
    });
    clone.style.setProperty("width", "100%");
    clone.style.setProperty("max-width", "1200px");
    clone.style.setProperty("margin", "0 auto");
    clone.style.setProperty("box-sizing", "border-box");
    clone.style.setProperty("overflow-x", "auto");
    clone.querySelectorAll<HTMLElement>("[data-copy-expand]").forEach((element) => {
      element.style.setProperty("max-height", "none", "important");
      element.style.setProperty("height", "auto", "important");
      element.style.setProperty("overflow", "visible", "important");
    });
    clone.querySelectorAll<HTMLElement>(".sticky").forEach((element) => {
      element.style.setProperty("position", "static", "important");
      element.style.setProperty("top", "auto", "important");
    });

    const weekMatch = generatedWeek?.match(/WW(\d{2})$/);
    const week = weekMatch ? `WW-${weekMatch[1]}` : `WW-${getIsoWorkWeekLabel(new Date(Date.parse(report.to) - 1)).slice(2)}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const documentHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DMR-AP1 B0 Execution Weekly Report for ${week}</title></head><body style="margin:0;padding:24px 16px;min-height:100vh;box-sizing:border-box;background:#f3f6fa;font-family:Arial,sans-serif"><main style="width:100%;max-width:1200px;margin:0 auto">${clone.outerHTML}</main></body></html>`;
    return { documentHtml, clipboardHtml: clone.outerHTML, week, timestamp, plainText: clone.innerText || clone.textContent || "" };
  };

  const downloadHtml = () => {
    const prepared = createStyledReportDocument();
    if (!prepared) return;
    const url = URL.createObjectURL(new Blob([prepared.documentHtml], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `DMR-AP1 B0 Execution Weekly Report for ${prepared.week}_${prepared.timestamp}.html`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyReport = async () => {
    setCopyStatus("");
    const prepared = createStyledReportDocument();
    if (!prepared) return;
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([prepared.documentHtml], { type: "text/html" }),
          "text/plain": new Blob([prepared.plainText], { type: "text/plain" }),
        })]);
        setCopyStatus("Report copied with formatting.");
        return;
      } catch {
        // Try the browser's selection-based rich-copy path below.
      }
    }
    if (copyHtmlWithSelection(prepared.clipboardHtml)) {
      setCopyStatus("Report copied with formatting.");
      return;
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(prepared.plainText);
        setCopyStatus("Copied as plain text; rich clipboard is blocked by this browser.");
        return;
      } catch {
        // Fall through to the legacy plain-text copy path.
      }
    }
    setCopyStatus(copyTextWithSelection(prepared.plainText)
      ? "Copied as plain text; rich clipboard is blocked by this browser."
      : "Could not copy the report. Check clipboard permission and try again.");
  };

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
      const nextGeneratedWeek = mode === "workWeek" ? `${workWeeks.year}${activeWeek.label}` : null;
      setHsdesDetailsLoading(false);
      setHsdesDetailsError("");
      setCopyStatus("");
      setReport(result);
      setGeneratedWeek(nextGeneratedWeek);
      try {
        window.sessionStorage.setItem(WEEKLY_REPORT_STORAGE_KEY, JSON.stringify({ report: result, generatedWeek: nextGeneratedWeek }));
      } catch {
        setError("Report created, but this browser could not save it for navigation.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the report.");
    } finally {
      setBusy(false);
    }
  };

  const clearReport = () => {
    setReport(null);
    setGeneratedWeek(null);
    setHsdesDetailsLoading(false);
    setHsdesDetailsError("");
    setCopyStatus("");
    setError("");
    try {
      window.sessionStorage.removeItem(WEEKLY_REPORT_STORAGE_KEY);
    } catch {
      // The visible report is cleared even if browser storage is unavailable.
    }
  };

  const control = "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm text-[var(--text)]";
  const attempted = report ? report.latestPassed + report.latestFailed + report.latestRerunPendingRunning : 0;
  const reportLinks = Array.isArray(report?.links) ? report.links : DEFAULT_WEEKLY_REPORT_LINKS;
  const hsdesIssues = Array.isArray(report?.hsdesIssues) ? report.hsdesIssues : [];
  const hsdesIssuesByDomain = [...hsdesIssues.reduce((groups, issue) => {
    const issues = groups.get(issue.domain) ?? [];
    issues.push(issue);
    groups.set(issue.domain, issues);
    return groups;
  }, new Map<string, typeof hsdesIssues>()).entries()]
    .sort(([left], [right]) => left.localeCompare(right));
  const activeHsdesDomain = hsdesIssuesByDomain.some(([domain]) => domain === hsdesDomainFilter) ? hsdesDomainFilter : "all";
  const filteredHsdesIssues = activeHsdesDomain === "all"
    ? hsdesIssues
    : hsdesIssues.filter((issue) => issue.domain === activeHsdesDomain);
  const agedHsdesIssues = Array.isArray(report?.agedHsdesIssues) ? report.agedHsdesIssues : [];
  const agedIssuesByDomain = [...agedHsdesIssues.reduce((groups, issue) => {
    const issues = groups.get(issue.domain) ?? [];
    issues.push(issue);
    groups.set(issue.domain, issues);
    return groups;
  }, new Map<string, typeof agedHsdesIssues>()).entries()]
    .sort(([left], [right]) => left.localeCompare(right));
  const teamPlatformCounts = report?.teamPlatformCounts ?? [];
  const teamPlatformTotals = teamPlatformCounts.reduce((totals, row) => ({ x1: totals.x1 + row.x1, x4: totals.x4 + row.x4 }), { x1: 0, x4: 0 });
  const createButton = (
    <button type="submit" disabled={busy || !modeReady} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] disabled:opacity-60">
      <FileText className="h-4 w-4" aria-hidden="true" />{busy ? "Creating…" : "Create report"}
    </button>
  );
  const downloadButton = report && (
    <button type="button" onClick={downloadHtml} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-alt)]">
      <Download className="h-4 w-4" aria-hidden="true" />Download report
    </button>
  );
  const clearReportButton = report && (
    <button type="button" onClick={clearReport} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-red-200 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50">
      <Trash2 className="h-4 w-4" aria-hidden="true" />Clear report
    </button>
  );
  const copyReportButton = report && (
    <button type="button" onClick={() => void copyReport()} disabled={busy || hsdesDetailsLoading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-alt)] disabled:cursor-not-allowed disabled:opacity-60">
      <Copy className="h-4 w-4" aria-hidden="true" />Copy Report
    </button>
  );
  return (
    <div className="mx-auto max-w-7xl text-[var(--text)]">
      <div className="mb-5 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
        <h1 className="text-lg font-semibold">Weekly Report</h1>
      </div>
      <form onSubmit={(event) => void create(event)} className="border-y border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        {mode === "dateRange" ? (
          <div className="flex flex-wrap items-end gap-3">
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
            {createButton}
            {downloadButton}
            {clearReportButton}
            {copyReportButton}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
          <label className="w-40 text-xs font-semibold text-[var(--text-muted)]">Work Week ({workWeeks.year})
            <select value={activeWeek.label} onChange={(event) => setSelectedWeek(event.target.value)} className={`mt-1 ${control}`}>
              {workWeeks.weeks.map((week) => <option key={week.label} value={week.label}>{week.label}</option>)}
            </select>
          </label>
            <span className="pb-2 text-xs text-[var(--text-muted)]">{timeLabel(activeWeek.from.toISOString())} – {timeLabel(new Date(activeWeek.to.getTime() - 1).toISOString())} IST</span>
            {createButton}
            {downloadButton}
            {clearReportButton}
            {copyReportButton}
          </div>
        )}
        <details className="mt-3 text-xs text-[var(--text-muted)]">
          <summary className="cursor-pointer">Suites: B0 P1 + P2</summary>
          <label className="mt-2 block max-w-3xl">Custom NGAi suite names (one per line; leave empty for B0 P1 + P2)
            <textarea value={suiteInput} onChange={(event) => setSuiteInput(event.target.value)} rows={2} className={`mt-1 ${control}`} />
          </label>
        </details>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        {copyStatus && <p role="status" className={`mt-3 text-sm ${copyStatus.startsWith("Could not") ? "text-red-600" : "text-[var(--text-muted)]"}`}>{copyStatus}</p>}
      </form>

      {!report && !busy && reportReady && <p className="py-12 text-center text-sm text-[var(--text-muted)]">No report generated yet.</p>}
      {report && <article ref={reportElementRef} className="mt-6 border border-[#c1d3e2] bg-white text-[#253646] shadow-sm">
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
            <li>Execution is currently running with <strong className="text-black">{report.runningBkc || "BKC#40"}</strong>.</li>
          </ul>
          <h4 className="mt-5 text-sm font-bold text-[#204e76]">Links</h4>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {reportLinks.map((link) => <li key={`${link.label}-${link.url}`}><a href={link.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[#205d92] underline underline-offset-2 hover:text-[#123b60]">{link.label}</a></li>)}
            {!reportLinks.length && <li className="text-[#647e94]">No links configured.</li>}
          </ul>
          <h4 className="mt-5 text-sm font-bold text-[#204e76]">HSDES Issues Opened More Than 30 Days Ago</h4>
          {report.sightingWarning ? (
            <p role="status" className="mt-3 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">HSDES issue list unavailable: {report.sightingWarning}</p>
          ) : agedIssuesByDomain.length ? (
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-[#253646]">
              <p><strong>{agedHsdesIssues.length}</strong> HSDES issues were opened more than 30 days ago.</p>
              <ul className="list-disc space-y-1 pl-5">
                {agedIssuesByDomain.map(([domain, issues]) => (
                  <li key={domain}>
                    <strong>{formatValidationGroup(domain)}:</strong>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {issues.map((issue) => (
                        <li key={issue.id}>
                        <a href={`https://hsdes.intel.com/appstore/article-one/#/${encodeURIComponent(issue.id)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#205d92] underline underline-offset-2">{issue.id}</a>
                          {` “${issue.title || "Untitled"}” `}<strong>({issue.status}, {issue.daysOpen} days)</strong>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#647e94]">No HSDES issues were opened more than 30 days ago.</p>
          )}
          <h4 className="mt-5 text-sm font-bold text-[#204e76]">DMR X1 and X4 CPU breakdown</h4>
          <div className="mt-3 overflow-x-auto border border-[#b8cadb]">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead className="bg-[#204e76] text-xs font-semibold text-white">
                <tr><th className="px-3 py-2.5">Team</th><th className="px-3 py-2.5">X1</th><th className="px-3 py-2.5">X4</th><th className="px-3 py-2.5">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-[#cfdae5]">
                {teamPlatformCounts.map((row) => (
                  <tr key={row.team} className="even:bg-[#edf3f9]">
                    <th className="px-3 py-2 font-semibold text-[#244c70]">{row.team}</th>
                    <td className="px-3 py-2 tabular-nums">{row.x1.toLocaleString()}</td>
                    <td className="px-3 py-2 tabular-nums">{row.x4.toLocaleString()}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{(row.x1 + row.x4).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-[#94aec6] bg-[#dce8f4] font-bold text-[#173f60]">
                <tr><th className="px-3 py-2 text-left">Total</th><td className="px-3 py-2 tabular-nums">{teamPlatformTotals.x1.toLocaleString()}</td><td className="px-3 py-2 tabular-nums">{teamPlatformTotals.x4.toLocaleString()}</td><td className="px-3 py-2 tabular-nums">{(teamPlatformTotals.x1 + teamPlatformTotals.x4).toLocaleString()}</td></tr>
              </tfoot>
            </table>
          </div>
        </section>

        <Breakdown title="Overall Validation group-wise failure breakdown" rows={report.backlogFailures} prebootAbortCounts={report.prebootAbortCounts} highlightFailureBreakdown />
        <section className="border-t border-[#d4e0eb] px-5 py-6 sm:px-7">
          <h2 className="mb-1 text-base font-bold text-[#204e76]">All HSDES Issues by Domain</h2>
          {hsdesDetailsLoading ? (
            <p role="status" className="mt-3 text-sm text-[#647e94]">Refreshing HSDES details for this saved report…</p>
          ) : hsdesDetailsError ? (
            <p role="alert" className="mt-3 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">{hsdesDetailsError}</p>
          ) : report.sightingWarning ? (
            <p role="status" className="mt-3 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">HSDES issue list unavailable: {report.sightingWarning}</p>
          ) : hsdesIssuesByDomain.length ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#57718a]">Showing {filteredHsdesIssues.length} of {hsdesIssues.length} HSDES issues across {hsdesIssuesByDomain.length} domains.</p>
                <label className="flex items-center gap-2 text-xs font-semibold text-[#244c70]">Domain
                  <select value={activeHsdesDomain} onChange={(event) => setHsdesDomainFilter(event.target.value)} className="h-8 rounded-md border border-[#b8cadb] bg-white px-2 text-xs font-normal text-[#253646]">
                    <option value="all">All domains ({hsdesIssues.length})</option>
                    {hsdesIssuesByDomain.map(([domain, issues]) => <option key={domain} value={domain}>{formatValidationGroup(domain)} ({issues.length})</option>)}
                  </select>
                </label>
              </div>
              <div data-copy-expand className="max-h-[32rem] overflow-auto overscroll-contain border border-[#b8cadb]">
                <table className="w-full min-w-[850px] border-collapse text-left text-xs" style={{ fontFamily: '"Courier New", Courier, monospace' }}>
                  <thead className="sticky top-0 z-10 bg-[#204e76] text-[11px] font-semibold text-white">
                    <tr><th className="w-40 px-2.5 py-2">Domain</th><th className="w-36 px-2.5 py-2">HSDES ID</th><th className="px-2.5 py-2">Title</th><th className="w-28 px-2.5 py-2">Status</th><th className="w-24 px-2.5 py-2">Days open</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#cfdae5]">
                    {filteredHsdesIssues.map((issue) => (
                      <tr key={issue.id} className="even:bg-[#edf3f9]">
                        <td className="px-2.5 py-2">{formatValidationGroup(issue.domain)}</td>
                        <td className="break-all px-2.5 py-2"><a href={`https://hsdes.intel.com/appstore/article-one/#/${encodeURIComponent(issue.id)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#205d92] underline underline-offset-2">{issue.id}</a></td>
                        <td className="break-words px-2.5 py-2">{issue.title || "Untitled"}</td>
                        <td className="px-2.5 py-2">{issue.status}</td>
                        <td className="px-2.5 py-2 tabular-nums">{issue.daysOpen}</td>
                      </tr>
                    ))}
                    {!filteredHsdesIssues.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-[#647e94]">No issues in this domain.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-[#647e94]">No HSDES issues found.</p>
          )}
        </section>
      </article>}
    </div>
  );
}