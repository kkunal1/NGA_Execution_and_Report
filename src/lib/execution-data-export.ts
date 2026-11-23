import type { ExecutionDataResult } from "./execution-data";
import { formatExecutionCategoryCounts, groupDomainExecutionCategories, groupExecutionSystemsByConfig, type ExecutionCategoryTest } from "./execution-data-view";
import { formatValidationGroupName } from "./normalize";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function duration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 3600).toLocaleString()}h ${Math.floor(total % 3600 / 60)}m ${total % 60}s`;
}

function timestamp(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date) : "-";
}

export function executionDataHtmlFilename(label: string, createdAt = new Date()): string {
  const safe = label.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 120) || "report";
  const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
  return `execution-data-${safe}-${timestamp}.html`;
}

function renderAttemptTests(items: ExecutionCategoryTest[]): string {
  return items.map(({ test, attempts }) => {
    const systems = new Set(attempts.map((attempt) => attempt.systemId ? `id:${attempt.systemId.toLowerCase()}` : attempt.systemName ? `name:${attempt.systemName.toLowerCase()}` : "").filter(Boolean));
    const seconds = attempts.reduce((sum, attempt) => sum + (attempt.seconds ?? 0), 0);
    return `<details class="test"><summary><strong>${escapeHtml(test.name)}</strong><span>${attempts.length} runs</span><span>${systems.size} systems</span><span>${escapeHtml(duration(seconds))}</span></summary><p class="meta">${escapeHtml(test.suite)} | Test line ID: ${escapeHtml(test.id)}</p><div class="table-wrap"><table><thead><tr><th>Run ID</th><th>Rerun index</th><th>Status</th><th>System</th><th>Station</th><th>Start (IST)</th><th>End (IST)</th><th>Duration</th></tr></thead><tbody>${attempts.map((attempt) => `<tr><td>${escapeHtml(attempt.runId)}</td><td>${escapeHtml(attempt.rerunIndex ?? "-")}</td><td>${escapeHtml(attempt.state)}</td><td>${escapeHtml(attempt.systemName ?? "Unknown")}</td><td>${escapeHtml(attempt.stationName ?? "Unknown")}</td><td>${escapeHtml(timestamp(attempt.start))}</td><td>${escapeHtml(timestamp(attempt.end))}</td><td>${escapeHtml(attempt.seconds === null ? "Unavailable" : duration(attempt.seconds))}</td></tr>`).join("")}</tbody></table></div></details>`;
  }).join("");
}

export function buildExecutionDataHtml(result: ExecutionDataResult, resultLabel: string, suiteNames: string[]): string {
  const systemGroups = groupExecutionSystemsByConfig(result);
  const knownConfigCount = systemGroups.filter((group) => group.configName !== "Unknown configuration").length;
  const busiest = result.domains.reduce<(typeof result.domains)[number] | null>((current, domain) => !current || domain.attempts > current.attempts ? domain : current, null);
  const domainCategories = result.domains.map((domain) => ({ domain, categories: groupDomainExecutionCategories(domain) }));
  const manualAttempts = domainCategories.reduce((total, { categories }) => total + categories.manualUnverified.reduce((count, item) => count + item.attempts.length, 0), 0);
  const unmappedAttempts = domainCategories.reduce((total, { categories }) => total + categories.unknown.reduce((count, item) => count + item.attempts.length, 0), 0);
  const planned = result.plannedConfigurations;
  const plannedOverview = planned
    ? `${planned.missingTestLines ? "At least " : ""}<strong>${planned.count.toLocaleString()}</strong> planned ${planned.count === 1 ? "configuration" : "configurations"} across the selected test lines${planned.missingTestLines ? `; ${planned.missingTestLines.toLocaleString()} test lines have no configuration data` : ""}.`
    : "Planned configuration count is unavailable. Submit again to load it.";
  const overview = [
    `<strong>Test cycle:</strong> ${escapeHtml(suiteNames.length ? suiteNames.join("; ") : resultLabel)}.`,
    plannedOverview,
    ...(result.totalAttempts ? [
      `<strong>${result.totalAttempts.toLocaleString()}</strong> ${result.totalAttempts === 1 ? "execution attempt was" : "execution attempts were"} recorded across <strong>${result.totalTests.toLocaleString()}</strong> ${result.totalTests === 1 ? "test line" : "test lines"}, including reruns and triage runs.`,
      result.systems.length ? `<strong>${result.systems.length.toLocaleString()}</strong> distinct ${result.systems.length === 1 ? "system was" : "systems were"} identified${knownConfigCount ? ` across <strong>${knownConfigCount.toLocaleString()}</strong> known ${knownConfigCount === 1 ? "configuration" : "configurations"}` : "; configuration details are unavailable"}.` : "No systems could be identified from the available mappings.",
      `Completed runs contributed <strong>${duration(result.totalSeconds)}</strong> of cumulative execution time. Parallel runs may overlap.`,
      ...(busiest && busiest.attempts > 0 ? [`<strong>${escapeHtml(formatValidationGroupName(busiest.name))}</strong> had the most recorded attempts (${busiest.attempts.toLocaleString()}).`] : []),
      `<strong>${manualAttempts.toLocaleString()}</strong> ${manualAttempts === 1 ? "execution attempt is" : "execution attempts are"} listed under manual execution; system details are unavailable and individual execution times are not shown.`,
      ...(unmappedAttempts ? [`${unmappedAttempts.toLocaleString()} ${unmappedAttempts === 1 ? "attempt has" : "attempts have"} station information but no unique system mapping.`] : []),
      ...(result.missingDurations ? [`${result.missingDurations.toLocaleString()} ${result.missingDurations === 1 ? "attempt has" : "attempts have"} incomplete or invalid timestamps and ${result.missingDurations === 1 ? "is" : "are"} excluded from duration totals.`] : []),
    ] : ["No started execution attempts were found for this selection."]),
  ];
  const systemRows = systemGroups.map((group) => `<tr><th scope="row">${escapeHtml(group.configName)}</th><td>${group.systems.map((system) => escapeHtml(system.name)).join(", ")}</td><td class="number">${group.systems.length}</td></tr>`).join("");
  const domains = domainCategories.map(({ domain, categories }) => {
    return `<details class="domain"><summary><strong>${escapeHtml(formatValidationGroupName(domain.name))}</strong><span>${domain.tests.length} tests</span><span>${domain.attempts} runs</span><span>${domain.systems.length} systems</span><span>${escapeHtml(duration(domain.totalSeconds))}</span>${domain.missingDurations ? `<span>${domain.missingDurations} incomplete durations</span>` : ""}</summary><details class="category"><summary><strong>Executed on NGA</strong><span>${escapeHtml(formatExecutionCategoryCounts(categories.nga))}</span></summary>${categories.nga.length ? renderAttemptTests(categories.nga) : `<p class="meta" style="padding:0 14px">No mapped runs.</p>`}</details><details class="category"><summary><strong>Manually Executed (unverified)</strong><span>${escapeHtml(formatExecutionCategoryCounts(categories.manualUnverified))}</span></summary><p class="meta" style="padding:0 14px">These runs have no station information; manual execution is not independently verified.</p>${categories.manualUnverified.length ? `<ul class="manual-tests">${categories.manualUnverified.map(({ test }) => `<li>${escapeHtml(test.name)}</li>`).join("")}</ul>` : `<p class="meta" style="padding:0 14px">No runs without station information.</p>`}</details>${categories.unknown.length ? `<details class="category"><summary><strong>System mapping unavailable</strong><span>${escapeHtml(formatExecutionCategoryCounts(categories.unknown))}</span></summary>${renderAttemptTests(categories.unknown)}</details>` : ""}</details>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Execution Data - ${escapeHtml(resultLabel)}</title><style>
    :root{color-scheme:light;--text:#20343e;--muted:#58717c;--line:#cbdce2;--surface:#f2f7f8;--accent:#168274}*{box-sizing:border-box}body{margin:0;background:#f4f7f8;color:var(--text);font:14px "Segoe UI",sans-serif;line-height:1.5}.wrap{max-width:1280px;margin:auto;padding:28px 20px 60px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:0 0 10px}.meta{color:var(--muted);font-size:12px;overflow-wrap:anywhere}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:22px 0;border-block:1px solid var(--line);padding:16px 0}.stat{border-left:3px solid var(--accent);padding-left:12px}.stat span{display:block;color:var(--muted);font-size:12px}.stat strong{font-size:18px}.overview{background:#eaf4f1;border-left:3px solid var(--accent);padding:15px 18px}.overview ul{margin:0;padding-left:20px}.overview li{margin:4px 0;overflow-wrap:anywhere}.warning{color:#85531a}.domain,.test,.systems{margin-top:12px;border:1px solid var(--line);background:#fff}.test,.category{margin:0;border-width:1px 0 0;border-style:solid;border-color:var(--line)}.category>summary{background:var(--surface)}.manual-tests{padding:0 34px 12px;overflow-wrap:anywhere}summary{cursor:pointer;padding:12px 14px;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center}summary strong{flex:1;min-width:180px;overflow-wrap:anywhere}summary span{font-size:12px;color:var(--muted)}.test summary{padding-left:26px}.test .meta{padding:0 14px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:9px 10px;border-top:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}thead th{background:#e2eef2;color:#36535e;white-space:nowrap}td.number{text-align:right}details>summary::-webkit-details-marker{display:none}details>summary::before{content:"\\25B8";color:var(--accent)}details[open]>summary::before{content:"\\25BE"}@media(max-width:600px){.wrap{padding:20px 12px}.table-wrap table{min-width:760px}}
  </style></head><body><main class="wrap"><h1>Check Execution Data</h1><p class="meta">${escapeHtml(resultLabel)}</p><p class="meta">All started runs, including reruns and triage runs. Time is summed across completed runs, so parallel execution overlaps.</p><div class="stats">${[["Test lines", result.totalTests.toLocaleString()], ["Run attempts", result.totalAttempts.toLocaleString()], ["Known systems", result.systems.length.toLocaleString()], ["Total execution time", duration(result.totalSeconds)]].map(([label, amount]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(amount)}</strong></div>`).join("")}</div><section class="overview"><h2>Execution overview</h2><ul>${overview.map((line) => `<li>${line}</li>`).join("")}</ul></section>${result.warnings.map((warning) => `<p class="warning">${escapeHtml(warning)}</p>`).join("")}<details class="systems"><summary><strong>Used systems (${result.systems.length})</strong></summary><p class="meta" style="padding:0 14px">Configurations and systems are mapped from NGAi stations at query time; historical mappings may have changed.</p>${systemRows ? `<div class="table-wrap"><table><thead><tr><th>Configuration</th><th>Systems</th><th class="number">Count</th></tr></thead><tbody>${systemRows}</tbody></table></div>` : `<p class="meta" style="padding:0 14px">No system mappings available.</p>`}</details>${domains || `<p class="meta">No started runs found for this selection.</p>`}</main></body></html>`;
}