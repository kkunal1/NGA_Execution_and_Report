import type { FailureRow, Stage, WeeklyReport, WeeklyReportDomainSummary } from "./weekly-report";
import { formatValidationGroupName } from "./normalize";
import { displayCpuAllocationTitle } from "./weekly-report-display";
import { getDailyReportLabel, getISTDateKey } from "./work-weeks";

const stages: Stage[] = ["Preboot", "PreTest", "Test", "PostTest", "Cleanup"];

export function weeklyReportEmailSubject(report: WeeklyReport) {
  const reportDate = getISTDateKey(new Date(report.from));
  return `DMR AP1 PV B0 Execution Weekly Status Report For ${getDailyReportLabel(reportDate)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function cell(value: string | number, header = false, darkHeader = false) {
  const tag = header ? "th" : "td";
  const weight = header
    ? darkHeader ? "font-weight:600;color:#fff;background:#204e76;" : "font-weight:600;color:#204e76;background:#eaf1f7;"
    : "";
  return `<${tag} style="border:1px solid #cbd7e2;padding:7px 9px;text-align:left;vertical-align:top;${weight}">${escapeHtml(String(value))}</${tag}>`;
}

function table(headers: string[], rows: (string | number)[][], darkHeader = true) {
  return `<div style="overflow-x:auto;margin:10px 0 20px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>${headers.map((header) => cell(header, true, darkHeader)).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((value) => cell(value)).join("")}</tr>`).join("") : `<tr>${cell("No data")}</tr>`}</tbody></table></div>`;
}

function breakdownCell(value: string | number, color: string, bold = false) {
  return `<td style="border:1px solid #cbd7e2;padding:7px 9px;text-align:left;vertical-align:top;color:${color};${bold ? "font-weight:700;" : ""}">${escapeHtml(String(value))}</td>`;
}

function section(title: string, content: string) {
  return `<h2 style="margin:26px 0 8px;border-bottom:2px solid #d7e3ee;padding-bottom:7px;color:#204e76;font-size:17px">${escapeHtml(title)}</h2>${content}`;
}

function failureTable(title: string, rows: FailureRow[]) {
  if (title === "Failure Breakdown in Selected Window") return "";
  const breakdownText = "failure breakdown";
  const breakdownIndex = title.toLowerCase().indexOf(breakdownText);
  const heading = breakdownIndex < 0
    ? escapeHtml(title)
    : `${escapeHtml(title.slice(0, breakdownIndex))}<span style="color:#dc2626">${escapeHtml(title.slice(breakdownIndex, breakdownIndex + breakdownText.length))}</span>${escapeHtml(title.slice(breakdownIndex + breakdownText.length))}`;
  const headers = ["Validation Group", "PreBoot", "PreTest", "Test", "PostTest", "Cleanup", "Total", "Sighting IDs Attached"];
  const body = rows.map((row) => `<tr>${[
    breakdownCell(formatValidationGroupName(row.group), "#244c70", true),
    ...stages.map((stage) => breakdownCell(row.stages[stage] ?? 0, row.stages[stage] ? "#bb3846" : "#72869a", Boolean(row.stages[stage]))),
    breakdownCell(row.total, "#204e76", true),
    breakdownCell(row.attached, "#087a78", true),
  ].join("")}</tr>`).join("");
  const reportTable = `<div style="overflow-x:auto;margin:10px 0 20px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>${headers.map((header) => cell(header, true, true)).join("")}</tr></thead><tbody>${body || `<tr><td colspan="8" style="border:1px solid #cbd7e2;padding:7px 9px;color:#647e94;text-align:center">No failed runs.</td></tr>`}</tbody></table></div>`;
  return `<h2 style="margin:26px 0 8px;border-bottom:2px solid #d7e3ee;padding-bottom:7px;color:#204e76;font-size:17px">${heading}</h2>${reportTable}`;
}

function domainSummarySection(rows: WeeklyReportDomainSummary[]) {
  const heading = `<h2 style="margin:26px 0 8px;border-bottom:2px solid #d7e3ee;padding-bottom:7px;color:#204e76;font-size:17px">DOMAIN-WISE DATA</h2>`;
  if (!rows.length) return `${heading}<p style="font-size:12px;color:#647e94">Domain-wise data is unavailable in this saved report.</p>`;

  const totals = rows.reduce((sum, row) => ({
    tests: sum.tests + row.tests,
    passed: sum.passed + row.passed,
    failed: sum.failed + row.failed,
    bucketized: sum.bucketized + row.bucketized,
    bucketizedWithHsd: sum.bucketizedWithHsd + row.bucketizedWithHsd,
    bucketizedUnderTriage: sum.bucketizedUnderTriage + row.bucketizedUnderTriage,
    bucketizedNoHsd: sum.bucketizedNoHsd + row.bucketizedNoHsd,
    blocked: sum.blocked + row.blocked,
    notRun: sum.notRun + row.notRun,
  }), { tests: 0, passed: 0, failed: 0, bucketized: 0, bucketizedWithHsd: 0, bucketizedUnderTriage: 0, bucketizedNoHsd: 0, blocked: 0, notRun: 0 });
  const passRate = (passed: number, tests: number) => tests ? `${(passed / tests * 100).toFixed(1).replace(/\.0$/, "")}%` : "0%";
  const dataCell = (value: string | number, color = "#253646", bold = false) => `<td style="border:1px solid #cbd7e2;padding:7px 9px;text-align:left;vertical-align:top;color:${color};${bold ? "font-weight:700;" : ""}">${escapeHtml(String(value))}</td>`;
  const bucketCell = (row: WeeklyReportDomainSummary) => `<td style="border:1px solid #cbd7e2;padding:7px 9px;text-align:left;vertical-align:top"><strong style="color:#204e76">${row.bucketized}</strong><div style="font-size:11px;line-height:1.4;white-space:nowrap"><span style="color:#0284c7">HSD ${row.bucketizedWithHsd}</span><br><span style="color:#f97316">Under Triage ${row.bucketizedUnderTriage}</span><br><span style="color:#64748b">Yet to Triage ${row.bucketizedNoHsd}</span></div></td>`;
  const renderRow = (row: WeeklyReportDomainSummary, index: number) => `<tr style="background:${index % 2 ? "#edf3f9" : "#fff"}">${dataCell(index + 1, "#72869a")}${dataCell(formatValidationGroupName(row.domain), "#244c70", true)}${dataCell(row.tests.toLocaleString("en-US"))}${dataCell(row.passed.toLocaleString("en-US"), "#16a34a")}${dataCell(`${row.passRatePct}%`, row.passRatePct >= 80 ? "#059669" : "#f97316")}${dataCell(row.failed.toLocaleString("en-US"), "#dc2626")}${bucketCell(row)}${dataCell(row.blocked.toLocaleString("en-US"), "#d97706")}${dataCell(row.notRun.toLocaleString("en-US"), "#64748b")}</tr>`;
  const totalRow = `<tr style="background:#dce8f4;font-weight:700;color:#173f60">${dataCell("")}${dataCell("Total / Average", "#173f60", true)}${dataCell(totals.tests.toLocaleString("en-US"), "#173f60", true)}${dataCell(totals.passed.toLocaleString("en-US"), "#15803d", true)}${dataCell(passRate(totals.passed, totals.tests), "#173f60", true)}${dataCell(totals.failed.toLocaleString("en-US"), "#b91c1c", true)}${bucketCell({ ...totals, domain: "Total", passRatePct: totals.tests ? totals.passed / totals.tests * 100 : 0 })}${dataCell(totals.blocked.toLocaleString("en-US"), "#b45309", true)}${dataCell(totals.notRun.toLocaleString("en-US"), "#173f60", true)}</tr>`;
  const headers = ["#", "Domain (Owner Team)", "Total", "Pass", "Pass %", "Fail", "Bucketized", "Blocked", "Not run"];
  return `${heading}<div style="overflow-x:auto;margin:10px 0 20px"><table style="width:100%;min-width:850px;border-collapse:collapse;font-size:12px"><thead><tr>${headers.map((label) => cell(label, true, true)).join("")}</tr></thead><tbody>${rows.map(renderRow).join("")}${totalRow}</tbody></table></div>`;
}

function safeReportLink(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? escapeHtml(parsed.href) : "";
  } catch {
    return "";
  }
}

function removeTableSection(documentHtml: string, headingHtml: string) {
  const headingStart = documentHtml.indexOf(headingHtml);
  if (headingStart < 0) return documentHtml;
  const tableStart = documentHtml.indexOf('<div style="overflow-x:auto;margin:10px 0 20px">', headingStart + headingHtml.length);
  const tableEnd = documentHtml.indexOf("</table></div>", tableStart);
  if (tableStart < 0 || tableEnd < 0) return documentHtml;
  return documentHtml.slice(0, headingStart) + documentHtml.slice(tableEnd + "</table></div>".length);
}

function renderWeeklyReportEmailDocument(report: WeeklyReport) {
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
    summary.domains.map((domain) => formatValidationGroupName(domain.domain)).join(", "),
    report.hsdFailureTitles?.[summary.hsdId] ?? "",
  ]);
  const issueRows = (report.hsdesIssues ?? []).map((issue) => [formatValidationGroupName(issue.domain), issue.id, issue.title || "Untitled", issue.status, issue.daysOpen]);
  const stageRows = (report.stageDetails ?? []).map((detail) => [detail.stage, formatValidationGroupName(detail.group), detail.config, detail.testLine, detail.step, detail.subState, detail.count]);
  const links = (report.links ?? []).map((link) => {
    const href = safeReportLink(link.url);
    return href ? `<li style="margin:4px 0"><a href="${href}" style="color:#205d92">${escapeHtml(link.label)}</a></li>` : "";
  }).filter(Boolean).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weekly Execution Report</title></head><body style="margin:0;background:#f3f6fa;color:#253646;font-family:Arial,sans-serif"><main style="max-width:1100px;margin:0 auto;padding:24px;background:#fff"><header style="border-left:4px solid #204e76;padding:4px 16px 16px"><p style="margin:0;color:#204e76;font-size:20px;font-weight:700">Weekly Execution Report</p><p style="margin:10px 0 0;font-size:14px">${escapeHtml(from)} – ${escapeHtml(to)} IST</p><p style="margin:10px 0 0;color:#60788e;font-size:12px">Generated ${escapeHtml(generated)}</p><p style="margin:12px 0 0;font-size:13px"><b>Suites:</b> ${report.suites.map(escapeHtml).join(", ")}</p></header>${section("Execution Summary", table(["Metric", "Count"], [["Execution Attempted", attempted], ["Test Passed", report.latestPassed], ["Test Failed", report.latestFailed], ["Test Blocked", report.blockedLines], ["Not run", report.latestNotRun], ["Planned", report.planned], ["Running BKC", report.runningBkc || "BKC#40"]]))}${section("CPU Breakdown", table(cpuHeaders, cpuRows))}${report.sightingWarning ? `<p style="padding:10px;border-left:3px solid #d7a02b;background:#fff6d6;color:#594416">HSDES details: ${escapeHtml(report.sightingWarning)}</p>` : ""}${failureTable("Failure Breakdown in Selected Window", report.windowFailures ?? [])}${failureTable("Overall Validation Group Failure Breakdown", [...breakdown.values()].sort((a, b) => b.total - a.total || a.group.localeCompare(b.group)))}${section("HSDs with 5 or More Failed Runs", table(["HSD", "Failed Tests", "Domain", "Title"], hsdRows))}${section("HSDES Issues by Domain", table(["Domain", "HSDES ID", "Title", "Status", "Days Open"], issueRows))}${section("Failure Stage Details", table(["Stage", "Group", "Configuration", "Test Line", "Step", "Sub-state", "Count"], stageRows))}${section("Links", links ? `<ul style="padding-left:20px;font-size:13px">${links}</ul>` : `<p style="font-size:13px;color:#60788e">No links configured.</p>`)}<footer style="margin-top:28px;border-top:1px solid #d7e3ee;padding-top:10px;color:#60788e;font-size:11px">Generated by NGA Execution Tracker</footer></main></body></html>`;
}

export function renderWeeklyReportEmailHtml(report: WeeklyReport) {
  const attempted = report.latestPassed + report.latestFailed + report.latestRerunPendingRunning;
  const percentage = (count: number) => report.planned
    ? `${(count / report.planned * 100).toFixed(1).replace(/\.0$/, "")}%`
    : "0%";
  const executionMetrics = [
    { label: "Execution Attempted", count: attempted, color: "#204e76", border: "#204e76", detail: "(pass + fail + rerun created)" },
    { label: "Test Passed", count: report.latestPassed, color: "#087a50", border: "#087a50" },
    { label: "Test Failed", count: report.latestFailed, color: "#bb3846", border: "#bb3846" },
    { label: "Test Blocked", count: report.blockedLines, color: "#aa5420", border: "#aa5420" },
    { label: "Not run", count: report.latestNotRun, color: "#9a6313", border: "#c1852c" },
  ];
  const executionMetricsTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:10px 0 20px;border-collapse:collapse;background:#eef4fa;border-top:1px solid #c4d6e5;border-bottom:1px solid #c4d6e5"><tbody><tr>${executionMetrics.map((metric) => `<td width="20%" style="width:20%;padding:14px 10px;vertical-align:top;background:#eef4fa"><div style="border-left:3px solid ${metric.border};padding-left:10px"><div style="color:#4e6c84;font-size:12px;font-weight:500">${metric.label}${metric.detail ? ` <span style="color:#60788e;font-size:10px;font-weight:400">${metric.detail}</span>` : ""}</div><div style="margin-top:4px;color:${metric.color};font-size:19px;font-weight:700">${metric.count.toLocaleString("en-US")} <span style="font-size:12px;font-weight:600">${percentage(metric.count)}</span></div></div></td>`).join("")}</tr></tbody></table>`;
  const executionSummary = `<h2 style="margin:26px 0 8px;border-bottom:2px solid #d7e3ee;padding-bottom:7px;color:#204e76;font-size:17px">Execution Summary</h2>${executionMetricsTable}`;
  const domainSummary = report.sectionVisibility?.domainWise === false ? "" : domainSummarySection(report.domainSummary ?? []);
  const statusSummary = `<section style="margin:20px 0;padding:0 12px;color:#253646"><h2 style="margin:0 0 8px;color:#204e76;font-size:17px">DMR-AP1 B0 Execution Status Summary</h2><ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7"><li><strong>${percentage(attempted)}</strong> tests have been attempted, with <strong style="color:#087a50">${percentage(report.latestPassed)} passed</strong>, <strong style="color:#bb3846">${percentage(report.latestFailed)} failed</strong> and <strong style="color:#aa5420">${percentage(report.blockedLines)} blocked</strong>.</li><li>Failure analysis and rerun in progress.</li><li>Execution is currently running with <strong>${escapeHtml(report.runningBkc || "BKC#40")}</strong>.</li></ul></section>`;
  const noteCallout = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:10px 0 0;border-collapse:collapse;background-color:#fff6d6"><tbody><tr><td style="padding:10px 14px;border-left:3px solid #d7a02b;background-color:#fff6d6;color:#594416;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.5"><strong>Note:</strong> This report was generated with AI assistance. The updates have been reviewed for accuracy.</td></tr></tbody></table>`;
  const reportLinks = (report.links ?? []).map((link) => {
    const href = safeReportLink(link.url);
    return href ? `<li style="margin:4px 0"><a href="${href}" style="color:#205d92">${escapeHtml(link.label)}</a></li>` : "";
  }).filter(Boolean).join("");
  const linksSection = section("Links", reportLinks
    ? `<ul style="padding-left:20px;font-size:13px">${reportLinks}</ul>`
    : `<p style="font-size:13px;color:#60788e">No links configured.</p>`);
  const oldCpuHeading = `<h2 style="margin:26px 0 8px;border-bottom:2px solid #d7e3ee;padding-bottom:7px;color:#204e76;font-size:17px">CPU Breakdown</h2>`;
  const cpuHeading = `<h2 style="margin:26px 0 8px;border-bottom:2px solid #d7e3ee;padding-bottom:7px;color:#204e76;font-size:17px">${escapeHtml(displayCpuAllocationTitle(report.cpuBreakdownTitle))}</h2>`;
  const hsdHeading = `<h2 style="margin:26px 0 8px;border-bottom:2px solid #d7e3ee;padding-bottom:7px;color:#204e76;font-size:17px">HSDs with 5 or More Failed Runs</h2>`;
  const overallFailureHeading = `<h2 style="margin:26px 0 8px;border-bottom:2px solid #d7e3ee;padding-bottom:7px;color:#204e76;font-size:17px">Overall Validation Group <span style="color:#dc2626">Failure Breakdown</span></h2>`;
  let reportDocument = renderWeeklyReportEmailDocument(report)
    .replace(/<h2 style="[^"]*">Execution Summary<\/h2>[\s\S]*?(?=<h2 style="[^"]*">CPU Breakdown<\/h2>)/, executionSummary)
    .replace(oldCpuHeading, cpuHeading)
    .replace(/<h2 style="[^"]*">Links<\/h2>[\s\S]*?(?=<footer)/, "")
    .replace(/<h2 style="[^"]*">Failure Stage Details<\/h2>[\s\S]*?(?=<footer)/, "")
    .replace(/<footer[^>]*>Generated by NGA Execution Tracker<\/footer>/, "");
  if (report.sectionVisibility?.cpuAllocation === false) reportDocument = removeTableSection(reportDocument, cpuHeading);
  if (report.sectionVisibility?.hsdFailureSummary === false) reportDocument = removeTableSection(reportDocument, hsdHeading);
  if (report.sectionVisibility?.overallFailureBreakdown === false) reportDocument = removeTableSection(reportDocument, overallFailureHeading);
  const linksBeforeCpu = reportDocument.replace(cpuHeading, `${linksSection}${cpuHeading}`);
  const domainSummaryBeforeBreakdown = linksBeforeCpu.replace(
    /<h2 style="[^"]*">Overall Validation Group <span style="color:#dc2626">Failure Breakdown<\/span><\/h2>/,
    (heading) => `${domainSummary}${heading}`,
  );
  return domainSummaryBeforeBreakdown.replace(/<header\b[^>]*>[\s\S]*?<\/header>/, `${noteCallout}${statusSummary}`);
}