import ExcelJS from "exceljs";
import type { ExecutionTimeSummary } from "./execution-time";

const SECONDS_PER_DAY = 24 * 60 * 60;

function formatDuration(seconds: number) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m ${total % 60}s`;
}

const minutes = (seconds: number) => Math.round((seconds / 60) * 100) / 100;
const days = (seconds: number) => Math.round((seconds / SECONDS_PER_DAY) * 100) / 100;

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportFileName(suiteName: string, extension: "xlsx" | "html") {
  const safeSuite = suiteName.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 120) || "suite";
  return `execution-time-${safeSuite}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export async function buildExecutionTimeXlsx(suiteName: string, summaries: ExecutionTimeSummary[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const headerStyle = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  };

  const overview = workbook.addWorksheet("Subsystems");
  overview.columns = [
    { header: "Subsystem", key: "subsystem", width: 28 },
    { header: "Total tests", key: "tests", width: 12 },
    { header: "Without timestamps", key: "excluded", width: 20 },
    { header: "Execution time", key: "duration", width: 18 },
    { header: "Minutes", key: "minutes", width: 14 },
    { header: "Days", key: "days", width: 10 },
  ];
  headerStyle(overview.getRow(1));

  const configs = workbook.addWorksheet("Configurations");
  configs.columns = [
    { header: "Subsystem", key: "subsystem", width: 28 },
    { header: "Configuration", key: "configuration", width: 55 },
    { header: "Total tests", key: "tests", width: 12 },
    { header: "Without timestamps", key: "excluded", width: 20 },
    { header: "Execution time", key: "duration", width: 18 },
    { header: "Minutes", key: "minutes", width: 14 },
    { header: "Days", key: "days", width: 10 },
  ];
  headerStyle(configs.getRow(1));

  const tests = workbook.addWorksheet("Tests");
  tests.columns = [
    { header: "Subsystem", key: "subsystem", width: 28 },
    { header: "Configuration", key: "configuration", width: 55 },
    { header: "Test name", key: "test", width: 80 },
    { header: "State", key: "state", width: 20 },
    { header: "Execution time", key: "duration", width: 18 },
    { header: "Minutes", key: "minutes", width: 14 },
    { header: "Days", key: "days", width: 10 },
  ];
  headerStyle(tests.getRow(1));

  for (const summary of summaries) {
    overview.addRow({
      subsystem: summary.subsystemName,
      tests: summary.totalTestCount,
      excluded: summary.excludedTestCount,
      duration: formatDuration(summary.totalSeconds),
      minutes: minutes(summary.totalSeconds),
      days: days(summary.totalSeconds),
    });
    for (const configuration of summary.configurations) {
      configs.addRow({
        subsystem: summary.subsystemName,
        configuration: configuration.configurationName,
        tests: configuration.totalTestCount,
        excluded: configuration.excludedTestCount,
        duration: formatDuration(configuration.totalSeconds),
        minutes: minutes(configuration.totalSeconds),
        days: days(configuration.totalSeconds),
      });
      for (const test of configuration.tests) {
        tests.addRow({
          subsystem: summary.subsystemName,
          configuration: configuration.configurationName,
          test: test.testName,
          state: test.state,
          duration: test.seconds == null ? "No timestamps" : formatDuration(test.seconds),
          minutes: test.seconds == null ? null : minutes(test.seconds),
          days: test.seconds == null ? null : days(test.seconds),
        });
      }
    }
  }

  for (const sheet of [overview, configs, tests]) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  }
  workbook.title = `Execution time - ${suiteName}`;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildExecutionTimeHtml(suiteName: string, summaries: ExecutionTimeSummary[]) {
  const subsystemBlocks = summaries.map((summary) => {
    const configBlocks = summary.configurations.map((configuration) => {
      const testRows = configuration.tests.map((test) => `
            <tr>
              <td>${escapeHtml(test.testName)}</td>
              <td><span class="state state-${escapeHtml(test.state.toLowerCase().replace(/[^a-z]/g, ""))}">${escapeHtml(test.state)}</span></td>
              <td class="num">${test.seconds == null ? "No timestamps" : escapeHtml(formatDuration(test.seconds))}</td>
              <td class="num">${test.seconds == null ? "-" : `${days(test.seconds).toFixed(2)} days`}</td>
            </tr>`).join("");
      return `
        <details class="config">
          <summary>
            <span class="name">${escapeHtml(configuration.configurationName)}</span>
            <span class="num">${configuration.totalTestCount} tests</span>
            <span class="num">${escapeHtml(formatDuration(configuration.totalSeconds))}</span>
            <span class="num">${days(configuration.totalSeconds).toFixed(2)} days</span>
          </summary>
          <table>
            <thead><tr><th>Test name</th><th>State</th><th>Execution time</th><th>Days</th></tr></thead>
            <tbody>${testRows}</tbody>
            <tfoot><tr><td>Total (${configuration.totalTestCount} tests)</td><td></td><td class="num">${minutes(configuration.totalSeconds).toLocaleString("en-US")} min</td><td class="num">${days(configuration.totalSeconds).toFixed(2)} days</td></tr></tfoot>
          </table>
        </details>`;
    }).join("");
    return `
      <details class="subsystem">
        <summary>
          <span class="name">${escapeHtml(summary.subsystemName)}</span>
          <span class="num">${summary.totalTestCount} tests</span>
          <span class="num">${escapeHtml(formatDuration(summary.totalSeconds))}${summary.excludedTestCount > 0 ? ` <small>(${summary.excludedTestCount} without timestamps)</small>` : ""}</span>
          <span class="num">${days(summary.totalSeconds).toFixed(2)} days</span>
        </summary>
        <div class="configs">${configBlocks}</div>
      </details>`;
  }).join("");

  const totalTests = summaries.reduce((sum, summary) => sum + summary.totalTestCount, 0);
  const totalSeconds = summaries.reduce((sum, summary) => sum + summary.totalSeconds, 0);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Execution Time - ${escapeHtml(suiteName)}</title>
<style>
  :root { --bg:#0f172a; --surface:#1e293b; --surface-alt:#162032; --border:#334155; --text:#e2e8f0; --muted:#94a3b8; --accent:#38bdf8; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Segoe UI", system-ui, sans-serif; background:var(--bg); color:var(--text); }
  .wrap { max-width:1200px; margin:0 auto; padding:32px 24px 64px; }
  h1 { margin:0 0 4px; font-size:24px; }
  .meta { color:var(--muted); font-size:14px; margin-bottom:20px; word-break:break-all; }
  .cards { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 18px; min-width:180px; }
  .card .label { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
  .card .value { font-size:22px; font-weight:700; margin-top:4px; }
  .panel { background:var(--surface); border:1px solid var(--border); border-radius:16px; overflow:hidden; }
  .head, summary { display:grid; grid-template-columns: minmax(0,2fr) minmax(7rem,1fr) minmax(12rem,1.5fr) minmax(7rem,1fr); gap:8px; align-items:center; }
  .head { padding:12px 20px; background:var(--surface-alt); color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; font-weight:600; }
  details.subsystem { border-top:1px solid var(--border); }
  details.subsystem > summary { padding:12px 20px; font-weight:600; }
  details.config > summary { padding:8px 12px; font-size:13px; }
  summary { cursor:pointer; list-style:none; }
  summary::-webkit-details-marker { display:none; }
  summary .name::before { content:"\\25B8"; display:inline-block; margin-right:8px; color:var(--muted); transition:transform .15s; }
  details[open] > summary .name::before { transform:rotate(90deg); }
  summary:hover { background:var(--surface-alt); }
  .name { overflow-wrap:anywhere; }
  .num { font-variant-numeric: tabular-nums; }
  small { color:var(--muted); font-weight:400; }
  .configs { background:rgba(0,0,0,.15); padding:8px 20px 12px; }
  details.config { border-bottom:1px solid var(--border); }
  table { width:100%; border-collapse:collapse; font-size:12px; margin:4px 0 10px; }
  th { text-align:left; color:var(--muted); font-weight:600; padding:6px 12px; border-bottom:1px solid var(--border); }
  td { padding:6px 12px; border-bottom:1px solid var(--border); vertical-align:top; overflow-wrap:anywhere; }
  tfoot td { font-weight:700; border-top:2px solid var(--border); border-bottom:none; }
  .state { display:inline-block; padding:1px 8px; border-radius:999px; background:#334155; color:var(--text); font-size:11px; }
  .state-passed { background:#14532d; color:#bbf7d0; }
  .state-failed { background:#7f1d1d; color:#fecaca; }
  .state-inprogress, .state-pendingrunning { background:#1e3a8a; color:#bfdbfe; }
  .state-pendinggatekeepers { background:#713f12; color:#fde68a; }
  .footer { color:var(--muted); font-size:12px; margin-top:16px; }
  @media print { body { background:#fff; color:#000; } details { display:block; } details > *:not(summary) { display:block !important; } }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Check Execution Time - Test Data</h1>
    <div class="meta">Suite: ${escapeHtml(suiteName)}</div>
    <div class="cards">
      <div class="card"><div class="label">Subsystems</div><div class="value">${summaries.length}</div></div>
      <div class="card"><div class="label">Total tests</div><div class="value">${totalTests}</div></div>
      <div class="card"><div class="label">Total execution time</div><div class="value">${escapeHtml(formatDuration(totalSeconds))}</div></div>
      <div class="card"><div class="label">Total days</div><div class="value">${days(totalSeconds).toFixed(2)}</div></div>
    </div>
    <div class="panel">
      <div class="head"><span>Subsystem name</span><span>Total test count</span><span>Total execution time</span><span>Days</span></div>
      ${subsystemBlocks}
    </div>
    <div class="footer">Generated ${escapeHtml(new Date().toLocaleString("en-US"))} · NGA Execution Tracker</div>
  </div>
</body>
</html>`;
}
