import type { RunResult, TestRow } from "./types";
import { THEMES, type ThemeId } from "./theme";
import { buildReportFilename } from "./report-filename";
import { formatValidationGroupName } from "./normalize";
import { visibleReportSections, type ReportSectionVisibility } from "./report-sections";
export { buildReportFilename } from "./report-filename";

const pctOfTotal = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<
        string,
        string
      >)[c],
  );

const COLORS: Record<string, string> = {
  Passed: "#16a34a",
  Failed: "#dc2626",
  Blocked: "#f59e0b",
  "In Progress": "#0ea5e9",
  "Not Run": "#94a3b8",
  Other: "#8b5cf6",
};

function donut(byState: { name: string; value: number }[]) {
  const total = byState.reduce((a, s) => a + s.value, 0) || 1;
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const rings = byState
    .map((s) => {
      const len = (s.value / total) * c;
      const seg = `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${
        COLORS[s.name] ?? "#64748b"
      }" stroke-width="28" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)"></circle>`;
      offset += len;
      return seg;
    })
    .join("");
  const legend = byState
    .map(
      (s) =>
        `<li><i style="background:${COLORS[s.name] ?? "#64748b"}"></i>${esc(s.name)} <b>${
          s.value
        }</b> <span>(${Math.round((s.value / total) * 100)}%)</span></li>`,
    )
    .join("");
  return `<div class="donut"><svg viewBox="0 0 200 200" width="200" height="200">${rings}</svg><ul class="legend">${legend}</ul></div>`;
}

function testsTable(rows: TestRow[]) {
  const sorted = [...rows].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  const body = sorted
    .map((r, i) => {
      const pass = r.bucket === "Passed";
      return `<tr><td class="num">${i + 1}</td><td class="name">${esc(r.domain || "-")}</td><td class="name">${esc(
        r.testline,
      )}</td><td><span class="pill" style="background:${pass ? "#16a34a" : "#dc2626"}">${
        pass ? "Pass" : "Fail"
      }</span></td><td>${esc(r.date ? new Date(r.date).toLocaleString() : "-")}</td></tr>`;
    })
    .join("");
  return `<table class="grid">
    <thead><tr><th>#</th><th>Domain</th><th>Testline</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>${body || '<tr><td colspan="5" class="empty">No executed tests.</td></tr>'}</tbody>
  </table>`;
}

function abortTable(rows: TestRow[]) {
  const byStep = new Map<string, number>();
  for (const r of rows) {
    const key = r.abortStep || "Aborted Manually";
    byStep.set(key, (byStep.get(key) ?? 0) + 1);
  }
  const sorted = [...byStep.entries()].sort((a, b) => b[1] - a[1]);
  const body = sorted
    .map(
      ([step, count], i) =>
        `<tr><td class="num">${i + 1}</td><td class="name">${esc(step)}</td><td class="num fail">${count}</td></tr>`,
    )
    .join("");
  return `<table class="grid">
    <thead><tr><th>#</th><th>Aborted at step (reason)</th><th>Count</th></tr></thead>
    <tbody>${body || '<tr><td colspan="3" class="empty">No aborted tests.</td></tr>'}</tbody>
  </table>`;
}

export function renderReportHtml(
  run: RunResult,
  abortedRows: TestRow[] = [],
  abortRangeLabel = "",
  theme: ThemeId = "professional",
  latestExecutedRows: TestRow[] = [],
  testRangeLabel = "",
  latestExecutedTotal?: number,
  sections: ReportSectionVisibility = { executionStatusSplit: true, rawStateValues: true },
): string {
  const t = THEMES[theme] ?? THEMES.professional;
  const { meta, summary } = run;
  const card = (label: string, value: string | number, tone = "", detail?: string) =>
    `<div class="card ${tone}"><span>${esc(label)}</span><b>${esc(value)}</b>${detail ? `<small>${esc(detail)}</small>` : ""}</div>`;

  const domainRows = (summary.byDomain ?? [])
    .map(
      (d, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td class="name">${esc(formatValidationGroupName(d.domain))}</td>
        <td class="num">${d.tests}</td>
        <td class="num pass">${d.passed}</td>
        <td class="num">${d.passRatePct}%</td>
        <td class="num fail">${d.failed}</td>
        <td class="num"><span class="bucketcell"><strong>${d.bucketized ?? 0}</strong><span class="bucketcounts"><span>HSD ${d.bucketizedWithHsd ?? 0}</span><span>Under Triage ${d.bucketizedUnderTriage ?? d.bucketizedWithoutHsd ?? 0}</span><span>No HSD ${d.bucketizedNoHsd ?? 0}</span></span></span></td>
        <td class="num block">${d.blocked}</td>
        <td class="num">${d.notRun}</td>
      </tr>`,
    )
    .join("");

  const rawRows = summary.byRawState
    .map(
      (s) =>
        `<tr><td class="name">${esc(s.name)}</td><td class="num">${s.value}</td><td class="num">${
          summary.tests ? Math.round((s.value / summary.tests) * 1000) / 10 : 0
        }%</td></tr>`,
    )
    .join("");

  const verification = meta.filterVerified
    ? `<div class="ok"><b>Filter verified</b> &mdash; row read back as <code>${esc(
        meta.appliedCondition.join(" / "),
      )}</code></div>`
    : `<div class="bad"><b>Filter did NOT verify</b> &mdash; row read back as <code>${esc(
        meta.appliedCondition.join(" / ") || "(empty)",
      )}</code>. Numbers below are not trustworthy.</div>`;

  const warnings = meta.warnings.length
    ? `<div class="warn"><b>Capture warnings</b><ul>${meta.warnings
        .map((w) => `<li>${esc(w)}</li>`)
        .join("")}</ul></div>`
    : "";
  const visibleSections = visibleReportSections(sections, {
    executionStatusSplit: `<h2>Execution status split</h2><div class="panel">${donut(summary.byState)}</div>`,
    rawStateValues: `<h2>Raw "${esc(meta.stateColumn)}" values</h2><table class="grid"><thead><tr><th>State</th><th>Tests</th><th>Share</th></tr></thead><tbody>${rawRows || '<tr><td colspan="3" class="empty">No states.</td></tr>'}</tbody></table>`,
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NGA Execution Report - ${esc(meta.runId)}</title>
<style>
:root{color-scheme:${theme === "black" ? "dark" : "light"}}
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 "Segoe UI",system-ui,sans-serif;background:${t.pageBg};color:${t.text}}
.wrap{max-width:1200px;margin:0 auto;padding:32px 24px 64px}
h1{font-size:24px;margin:0 0 4px}
h2{font-size:15px;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.06em;color:${t.textMuted}}
.sub{color:${t.textMuted};margin:0 0 24px}
.sub code{background:${t.surfaceAlt};padding:2px 6px;border-radius:4px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.card{background:${t.surface};border:1px solid ${t.border};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.card span{color:${t.textMuted};font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.card b{font-size:26px;color:${t.text}}
.card small{font-size:12px;font-weight:600;color:${t.textMuted}}
.card.pass b{color:#16a34a}.card.fail b{color:#dc2626}.card.block b{color:#f59e0b}
.card.pass small{color:#16a34a}.card.fail small{color:#dc2626}.card.block small{color:#f59e0b}
.note{border-left:3px solid #d7a02b;background:#fff6d6;color:#594416;padding:8px 12px;margin:0 0 16px}
.panel{background:${t.surface};border:1px solid ${t.border};border-radius:10px;padding:20px}
.donut{display:flex;gap:32px;align-items:center;flex-wrap:wrap}
.legend{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.legend li{display:flex;align-items:center;gap:8px;color:${t.text}}
.legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
.legend span{color:${t.textMuted}}
table.grid{width:100%;border-collapse:collapse;background:${t.surface};border:1px solid ${t.border};border-radius:10px;overflow:hidden;color:${t.text}}
table.grid th,table.grid td{padding:8px 12px;border-bottom:1px solid ${t.border};text-align:left;font-size:13px}
table.grid th{background:${t.surfaceAlt};color:${t.textMuted};font-weight:600}
td.num{text-align:right;font-variant-numeric:tabular-nums}
td.pass{color:#16a34a}td.fail{color:#dc2626}td.block{color:#b45309}
.bucketcell{display:inline-flex;align-items:center;gap:8px}.bucketcounts{display:flex;flex-direction:column;white-space:nowrap;font-size:11px;line-height:16px;color:${t.textMuted}}
.bucketcounts span:first-child{color:#0284c7}
td.name{max-width:520px;word-break:break-word}
td.empty{text-align:center;color:${t.textMuted};padding:20px}
.pill{color:#fff;border-radius:999px;padding:2px 10px;font-size:11px;white-space:nowrap}
.pctcell{white-space:nowrap}
.pctcell span{font-size:12px;color:${t.textMuted};margin-left:8px;vertical-align:middle}
.bar{display:inline-block;width:90px;height:8px;background:${t.surfaceAlt};border-radius:4px;overflow:hidden;vertical-align:middle}
.bar span{display:block;height:100%}
.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-top:24px;color:#78350f}
.warn ul{margin:8px 0 0;padding-left:18px}
.ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:10px;padding:10px 16px;margin:0 0 20px}
.bad{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:10px 16px;margin:0 0 20px}
.ok code,.bad code{background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px}
footer{margin-top:40px;color:${t.textMuted};font-size:12px}
@media print{body{background:#fff}.panel,table.grid,.card{break-inside:avoid}}
</style></head>
<body><div class="wrap">
<h1>NGA Execution Report</h1>
<p class="sub">Suite <code>${esc(meta.filter.value)}</code><br>
Captured ${esc(new Date(meta.capturedAt).toLocaleString())}</p>

${verification}

<p class="note">Note: <strong>Execution Attempted = Passed + Failed + reruns</strong> created for failed tests that are now moved to <strong>NOT RUN</strong>.</p>

<div class="cards">
  ${card("Total tests", summary.tests)}
  ${card("Execution Attempted", summary.executionAttempted, "", `${pctOfTotal(summary.executionAttempted, summary.tests)}%`)}
  ${card("Passed", summary.passed, "pass", `${summary.passRatePct}%`)}
  ${card("Failed", summary.failed, "fail", `${pctOfTotal(summary.failed, summary.tests)}%`)}
  ${card("Blocked", summary.blocked, "block", `${pctOfTotal(summary.blocked, summary.tests)}%`)}
  ${card("In progress", summary.inProgress)}
  ${card("Not run", summary.notRun)}
  ${summary.other > 0 ? card("Other", summary.other) : ""}
</div>

${visibleSections}

<h2>Domain-wise data</h2>
<table class="grid">
  <thead><tr><th>#</th><th>Domain (Owner Team)</th><th>Total</th><th>Pass</th><th>Pass %</th><th>Fail</th><th>Bucketized</th><th>Blocked</th><th>Not run</th></tr></thead>
  <tbody>${domainRows || '<tr><td colspan="9" class="empty">No domain data.</td></tr>'}</tbody>
</table>

<h2>Aborted tests (${abortedRows.length})${abortRangeLabel ? ` &mdash; filtered range: ${esc(abortRangeLabel)}` : ""}</h2>
${abortTable(abortedRows)}

<h2>Latest executed tests (${latestExecutedTotal && latestExecutedTotal > latestExecutedRows.length ? `showing ${latestExecutedRows.length} of ${latestExecutedTotal}` : latestExecutedRows.length})${testRangeLabel ? ` &mdash; filtered range: ${esc(testRangeLabel)}` : ""}</h2>
${testsTable(latestExecutedRows)}

${warnings}
<footer>Generated by NGA Execution &amp; Report - run ${esc(meta.runId)} - capture took ${Math.round(
    meta.durationMs / 1000,
  )}s</footer>
</div></body></html>`;
}
