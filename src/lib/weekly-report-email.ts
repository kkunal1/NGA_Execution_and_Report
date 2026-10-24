import type { FailureRow, Stage, WeeklyReport } from "./weekly-report";

const stages: Stage[] = ["Preboot", "PreTest", "Test", "PostTest", "Cleanup"];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function cell(value: string | number, header = false) {
  const tag = header ? "th" : "td";
  const weight = header ? "font-weight:600;color:#204e76;background:#eaf1f7;" : "";
  return `<${tag} style="border:1px solid #cbd7e2;padding:7px 9px;text-align:left;vertical-align:top;${weight}">${escapeHtml(String(value))}</${tag}>`;
}

function table(headers: string[], rows: (string | number)[][]) {
  return `<div style="overflow-x:auto;margin:10px 0 20px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>${headers.map((header) => cell(header, true)).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((value) => cell(value)).join("")}</tr>`).join("") : `<tr>${cell("No data")}</tr>`}</tbody></table></div>`;
}

function section(title: string, content: string) {
  return `<h2 style="margin:26px 0 8px;border-bottom:2px solid #d7e3ee;padding-bottom:7px;color:#204e76;font-size:17px">${escapeHtml(title)}</h2>${content}`;
}

function failureTable(title: string, rows: FailureRow[]) {
  return section(title, table(
    ["Validation Group", "PreBoot", "PreTest", "Test", "PostTest", "Cleanup", "Total", "Sighting IDs Attached"],
    rows.map((row) => [row.group, ...stages.map((stage) => row.stages[stage] ?? 0), row.total, row.attached]),
  ));
}

function safeReportLink(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? escapeHtml(parsed.href) : "";
  } catch {
    return "";
  }
}

export function renderWeeklyReportEmailHtml(report: WeeklyReport) {
  const attempted = report.latestPassed + report.latestFailed + report.latestRerunPendingRunning;
  const from = new Date(report.from).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const to = new Date(Date.parse(report.to) - 1).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const generated = new Date(report.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const breakdown = new Map(report.backlogFailures.map((row) => [row.group, { ...row, stages: { ...row.stages } }]));
  for (const [group, count] of Object.entries(report.prebootAbortCounts ?? {})) {
    const row = breakdown.get(group) ?? {
      group,
      stages: { Preboot: 0, RebootStation: 0, PreTest: 0, Test: 0, PostTest: 0, Cleanup: 0, Other: 0 },
      total: 0,
      attached: 0,
    };
    row.stages.Preboot = count;
    row.total = Object.values(row.stages).reduce((sum, value) => sum + value, 0);
    breakdown.set(group, row);
  }

  const cpuColumns = report.cpuColumns ?? [];
  const hasCustomTotal = cpuColumns.some((column) => column.toLowerCase() === "total");
  const cpuHeaders = [report.cpuBaseLabels?.team ?? "Team", report.cpuBaseLabels?.x1 ?? "X1", report.cpuBaseLabels?.x4 ?? "X4", ...cpuColumns];
  if (!hasCustomTotal) cpuHeaders.push("Total");
  const cpuRows = (report.teamPlatformCounts ?? []).map((row) => {
    const values: (string | number)[] = [row.team, row.x1, row.x4, ...cpuColumns.map((_, index) => row.extraCounts?.[index] ?? 0)];
    if (!hasCustomTotal) values.push(row.x1 + row.x4 + (row.extraCounts ?? []).reduce((sum, count) => sum + count, 0));
    return values;
  });
  const hsdRows = (report.hsdFailureSummaries ?? []).filter((summary) => summary.failedRuns >= 5).map((summary) => [
    summary.hsdId,
    summary.failedRuns,
    summary.domains.map((domain) => `${domain.domain} (${domain.failedRuns})`).join(", "),
    report.hsdFailureTitles?.[summary.hsdId] ?? "",
  ]);
  const issueRows = (report.hsdesIssues ?? []).map((issue) => [issue.domain, issue.id, issue.title || "Untitled", issue.status, issue.daysOpen]);
  const stageRows = (report.stageDetails ?? []).map((detail) => [detail.stage, detail.group, detail.config, detail.testLine, detail.step, detail.subState, detail.count]);
  const links = (report.links ?? []).map((link) => {
    const href = safeReportLink(link.url);
    return href ? `<li style="margin:4px 0"><a href="${href}" style="color:#205d92">${escapeHtml(link.label)}</a></li>` : "";
  }).filter(Boolean).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weekly Execution Report</title></head><body style="margin:0;background:#f3f6fa;color:#253646;font-family:Arial,sans-serif"><main style="max-width:1100px;margin:0 auto;padding:24px;background:#fff"><header style="border-left:4px solid #204e76;padding:4px 16px 16px"><p style="margin:0;color:#204e76;font-size:20px;font-weight:700">Weekly Execution Report</p><p style="margin:10px 0 0;font-size:14px">${escapeHtml(from)} – ${escapeHtml(to)} IST</p><p style="margin:10px 0 0;color:#60788e;font-size:12px">Generated ${escapeHtml(generated)}</p><p style="margin:12px 0 0;font-size:13px"><b>Suites:</b> ${report.suites.map(escapeHtml).join(", ")}</p></header>${section("Execution Summary", table(["Metric", "Count"], [["Execution Attempted", attempted], ["Test Passed", report.latestPassed], ["Test Failed", report.latestFailed], ["Test Blocked", report.blockedLines], ["Not run", report.latestNotRun], ["Planned", report.planned], ["Running BKC", report.runningBkc || "BKC#40"]]))}${section("CPU Breakdown", table(cpuHeaders, cpuRows))}${report.sightingWarning ? `<p style="padding:10px;border-left:3px solid #d7a02b;background:#fff6d6;color:#594416">HSDES details: ${escapeHtml(report.sightingWarning)}</p>` : ""}${failureTable("Failure Breakdown in Selected Window", report.windowFailures ?? [])}${failureTable("Overall Validation Group Failure Breakdown", [...breakdown.values()].sort((a, b) => b.total - a.total || a.group.localeCompare(b.group)))}${section("HSDs with 5 or More Failed Runs", table(["HSD", "Failed Tests", "Domain", "Title"], hsdRows))}${section("HSDES Issues by Domain", table(["Domain", "HSDES ID", "Title", "Status", "Days Open"], issueRows))}${section("Failure Stage Details", table(["Stage", "Group", "Configuration", "Test Line", "Step", "Sub-state", "Count"], stageRows))}${section("Links", links ? `<ul style="padding-left:20px;font-size:13px">${links}</ul>` : `<p style="font-size:13px;color:#60788e">No links configured.</p>`)}<footer style="margin-top:28px;border-top:1px solid #d7e3ee;padding-top:10px;color:#60788e;font-size:11px">Generated by NGA Execution Tracker</footer></main></body></html>`;
}