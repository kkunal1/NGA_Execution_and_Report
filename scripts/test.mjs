// Sanity checks for state bucketing and payload harvesting.
// Run with: npm run test
import assert from "node:assert/strict";
import { bucketOf, formatValidationGroupName, harvestRecords, makeRowFactory, findReportedTotal, normalizeSuiteNames } from "../src/lib/normalize.ts";
import { summarize } from "../src/lib/summarize.ts";
import { summarizeWeeklyReport } from "../src/lib/weekly-report.ts";
import { isValidAdminPassword, normalizeAdminUsername } from "../src/lib/admin-users.ts";
import { DEFAULT_DASHBOARD_SETTINGS } from "../src/lib/dashboard-settings.ts";
import { DEFAULT_POOL_NAMES, normalizePoolNames } from "../src/lib/pool-system-settings.ts";
import { poolMembershipFilter } from "../src/lib/pool-systems.ts";
import { DEFAULT_CPU_BASE_LABELS, DEFAULT_CPU_BREAKDOWN_TITLE, DEFAULT_TEAM_PLATFORM_COUNTS, DEFAULT_WEEKLY_REPORT_BKC, DEFAULT_WEEKLY_REPORT_HSDES_LINK, DEFAULT_WEEKLY_REPORT_LINKS, normalizeCpuBaseLabels, normalizeCpuBreakdownTitle, normalizeCpuColumns, normalizeTeamPlatformCounts, normalizeWeeklyReportBkc, normalizeWeeklyReportHsdesLink, normalizeWeeklyReportLinks } from "../src/lib/weekly-report-settings.ts";
import { aggregateHsdesIssueIdsByDomain, canonicalizeSightingDomain, collectHsdesQueryPages, extractHsdesIssues, extractHsdesIssuesOlderThan } from "../src/lib/hsdes-sightings.ts";
import { chooseExactIndex, scoped } from "../src/lib/selectors.ts";
import { checkCondition, matchesExactly } from "../src/lib/verify.ts";
import { decryptNgaiToken, encryptNgaiToken } from "../src/lib/ngai-token-crypto.ts";
import { buildReportFilename } from "../src/lib/report-filename.ts";
import { renderReportHtml } from "../src/lib/report-html.ts";
import { visibleReportSections } from "../src/lib/report-sections.ts";
import { getWorkWeeks } from "../src/lib/work-weeks.ts";

const encryptionKey = Buffer.alloc(32, 7);
assert.equal(normalizeAdminUsername("new.admin"), "new.admin");
assert.equal(normalizeAdminUsername("root"), null);
assert.equal(normalizeAdminUsername("bad user"), null);
assert.equal(isValidAdminPassword("long-enough-password"), true);
assert.equal(isValidAdminPassword("abcd"), true);
assert.equal(isValidAdminPassword("abc"), false);
assert.equal(DEFAULT_DASHBOARD_SETTINGS.showManualAborts, true);
assert.deepEqual(DEFAULT_POOL_NAMES, ["pv_dmr-ap-ap1-b0"]);
assert.deepEqual(normalizePoolNames([" pv_dmr-ap-ap1-b0 ", "another_pool"]), ["pv_dmr-ap-ap1-b0", "another_pool"]);
assert.equal(normalizePoolNames([]), null);
assert.equal(normalizePoolNames(["test-pool", "TEST-POOL"]), null);
assert.equal(normalizePoolNames(["invalid'pool"]), null);
assert.equal(poolMembershipFilter(["pv_dmr-ap-ap1-b0", "extra_pool"], "Station/LatestStationPool"),
  "Station/LatestStationPool/any(p: p/Pool/PoolName eq 'pv_dmr-ap-ap1-b0' or p/Pool/PoolName eq 'extra_pool')");
const encryptedToken = encryptNgaiToken("sample-pat", encryptionKey);
assert.notEqual(encryptedToken.ciphertext, "sample-pat");
assert.equal(decryptNgaiToken(encryptedToken, encryptionKey), "sample-pat");
assert.throws(() => decryptNgaiToken(encryptedToken, Buffer.alloc(32, 8)), /Could not decrypt/);
assert.deepEqual(
  normalizeSuiteNames([" Suite One ", "", "suite one", "Suite Two\nSuite Three"]),
  ["Suite One", "Suite Two", "Suite Three"],
);
assert.equal(formatValidationGroupName("pv_power_management"), "Power Management");
assert.equal(formatValidationGroupName("pv_memory"), "Memory");
assert.equal(formatValidationGroupName("pv_serial_io"), "Serial IO");
assert.equal(formatValidationGroupName("pv_ras"), "RAS");
const multiSuiteFilename = buildReportFilename("Suite_One\nSuite_Two");
assert.ok(!/[\r\n\t]/.test(multiSuiteFilename), "report filename must not contain control characters");
assert.ok(multiSuiteFilename.startsWith("Suite_One_Suite_Two_"));

assert.equal(
  scoped('[data-nga-row="1"] ', 'select, [role="combobox"]'),
  '[data-nga-row="1"] select, [data-nga-row="1"] [role="combobox"]',
  "scoped() must prefix every branch",
);
assert.equal(scoped("", "select, input"), "select, input");

// Dropdown option picking: "Name" must never resolve to the "GoalName" listed first.
assert.equal(chooseExactIndex(["GoalName", "Name", "NameSpace"], "Name"), 1);
assert.equal(chooseExactIndex(["GoalName", "NameSpace"], "Name"), -1);
assert.equal(chooseExactIndex(["  Name \n", "GoalName"], "Name"), 0);
assert.equal(chooseExactIndex(["Not Equal", "Equal"], "Equal"), 1);
assert.equal(chooseExactIndex(["TestCase", "TestLine"], "TestLine"), 1);
assert.equal(chooseExactIndex([], "Name"), -1);

// Filter verification: "GoalName" must never satisfy an expected "Name".
const expected = {
  entity: "TestLine",
  field: "Name",
  operator: "Equal",
  value: "Oak_Stream_Platform_1_DMR",
};

assert.deepEqual(
  checkCondition(expected, {
    controls: ["TestLine", "Name", "Equal"],
    inputs: ["Oak_Stream_Platform_1_DMR"],
  }),
  [],
  "exact row must pass",
);

const goalName = checkCondition(expected, {
  controls: ["TestLine", "GoalName", "Equal"],
  inputs: ["Oak_Stream_Platform_1_DMR"],
});
assert.equal(goalName.length, 1, "GoalName must be rejected");
assert.match(goalName[0], /field box should be "Name" but shows "GoalName"/);

assert.equal(
  checkCondition(expected, {
    controls: ["TestLine", "Name arrow_drop_down", "Equal"],
    inputs: ["Oak_Stream_Platform_1_DMR"],
  }).length,
  0,
  "dropdown chrome must be ignored",
);

assert.equal(
  checkCondition(expected, { controls: ["TestLine", "Name", "Equal"], inputs: [] }).length,
  1,
  "missing value must be reported",
);
assert.equal(
  checkCondition(expected, { controls: [], inputs: [] }).length,
  4,
  "empty row must report every box",
);

assert.ok(matchesExactly("Name", "Name"));
assert.ok(!matchesExactly("GoalName", "Name"));
assert.ok(!matchesExactly("", "Name"));
assert.ok(matchesExactly("Not Equal", "Not Equal"));
assert.ok(!matchesExactly("Not Equal", "Equal"), "substring operators must not match");


const cases = [
  ["Passed", "Passed"],
  ["PASS", "Passed"],
  ["Failed", "Failed"],
  ["Test Failed", "Failed"],
  ["Infra Error", "Blocked"],
  ["Aborted", "Blocked"],
  ["Skipped", "Blocked"],
  ["InProgress", "In Progress"],
  ["In Progress", "In Progress"],
  ["PendingRunning", "Not Run"],
  ["PendingGatekeepers", "Not Run"],
  ["In Queue", "Not Run"],
  ["Not Run", "Not Run"],
  ["", "Not Run"],
  ["N/A", "Not Run"],
  ["Weird Thing", "Other"],
];
for (const [input, expected] of cases) {
  assert.equal(bucketOf(input), expected, `bucketOf("${input}")`);
}
assert.equal(bucketOf("PendingGatekeepers", "Blocked"), "Blocked");
assert.equal(bucketOf("PendingGatekeeper", "Blocked"), "Blocked");
assert.equal(bucketOf("PendingGatekeepers", "Go"), "Not Run");
assert.equal(bucketOf("PendingGatekeeper", "Go"), "Not Run");
assert.equal(bucketOf("PendingGatekeepers", "blocked"), "Blocked");

const payload = {
  data: {
    total: 3,
    items: [
      { Name: "test_a", "Testline Name": "TL1", "Last Rerun State": "Passed" },
      { Name: "test_b", "Testline Name": "TL1", "Last Rerun State": "Failed" },
      { Name: "test_c", "Testline Name": "TL1", "Last Rerun State": "Not Run" },
    ],
  },
};

const records = harvestRecords(payload);
assert.equal(records.length, 3, "harvestRecords count");
assert.equal(findReportedTotal(payload), 3, "reported total");

const toRow = makeRowFactory("Last Rerun State");
const rows = records.map(toRow);
assert.equal(rows[0].name, "test_a");
assert.equal(rows[0].testline, "TL1");
assert.equal(rows[1].bucket, "Failed");
assert.equal(
  toRow({ Name: "gatekeeper_blocked", "Last Rerun State": "PendingGatekeepers", "Go Status": "Blocked" }, 3).bucket,
  "Blocked",
);
assert.equal(
  toRow({ Name: "gatekeeper_go", "Last Rerun State": "PendingGatekeepers", "Go Status": "Go" }, 4).bucket,
  "Not Run",
);

const s = summarize(rows);
assert.equal(s.tests, 3);
assert.equal(s.passed, 1);
assert.equal(s.failed, 1);
assert.equal(s.notRun, 1);
assert.equal(s.executed, 2);
assert.equal(s.progressPct, 66.7);
assert.equal(s.passRatePct, 33.3);
assert.equal(s.byTestline[0].testline, "TL1");
assert.equal(s.failures.length, 1);
const reportSections = visibleReportSections(
  { executionStatusSplit: false, rawStateValues: false },
  { executionStatusSplit: "<h2>Execution status split</h2>", rawStateValues: '<h2>Raw "State" values</h2>' },
);
assert.ok(!reportSections.includes("Execution status split"), "disabled execution split must be omitted from exported HTML");
assert.ok(!reportSections.includes('Raw "State" values'), "disabled raw states must be omitted from exported HTML");
assert.equal(
  visibleReportSections(
    { executionStatusSplit: true, rawStateValues: false },
    { executionStatusSplit: "execution chart", rawStateValues: "raw values" },
  ),
  "execution chart",
  "each HTML section follows its matching shared visibility setting",
);

const attemptedSummary = summarize([
  { ...rows[0], bucket: "Passed", state: "Passed", rerunIndex: 0 },
  { ...rows[1], bucket: "Failed", state: "Failed", rerunIndex: 0 },
  { ...rows[2], bucket: "Not Run", state: "PendingRunning", rerunIndex: 0 },
  { ...rows[2], id: "rerun-pending", bucket: "Not Run", state: "PendingRunning", rerunIndex: 2 },
]);
assert.equal(attemptedSummary.executionAttempted, 3, "attempted includes pass + fail + PendingRunning reruns with index > 0");
const customReportLinks = [
  { label: "PV VV Exec Summary Dashboard", url: "https://xve-dashboards.intel.com/dmr-ap/execution-summary" },
  { label: "DMR Query", url: "https://hsdes.intel.com/appstore/generalapps/#/pages/community/15010407190?queryId=16032003391" },
];
const weeklyReport = summarizeWeeklyReport(
  ["suite"],
  new Date("2026-10-01T00:00:00Z"),
  new Date("2026-10-08T00:00:00Z"),
  [],
  [],
  [
    { state: "Aborted", validationGroup: { testGroupName: "pv_security" }, autoDisablingTestStep: { testStepName: "HPreBoot_UpdateSUTCollateral" } },
    { state: "Aborted", validationGroup: { testGroupName: "pv_security" }, autoDisablingTestStep: { testStepName: "HPreBoot_UpdateNUCCollateral_pv" } },
    { state: "Aborted", validationGroup: { testGroupName: "pv_memory" }, autoDisablingTestStep: { testStepName: "HPreBoot_UpdateSUTCollateral" } },
    { state: "Aborted", validationGroup: { testGroupName: "pv_security" }, autoDisablingTestStep: { testStepName: "DifferentStep" } },
  ],
  "BKC#WW41",
  DEFAULT_TEAM_PLATFORM_COUNTS,
  customReportLinks,
);
assert.deepEqual(weeklyReport.prebootAbortCounts, { pv_memory: 1, pv_security: 2 });
assert.equal(weeklyReport.runningBkc, "BKC#WW41");
assert.deepEqual(weeklyReport.cpuBaseLabels, DEFAULT_CPU_BASE_LABELS);
assert.equal(weeklyReport.cpuBreakdownTitle, DEFAULT_CPU_BREAKDOWN_TITLE);
assert.deepEqual(weeklyReport.teamPlatformCounts, DEFAULT_TEAM_PLATFORM_COUNTS);
assert.deepEqual(weeklyReport.cpuColumns, []);
const reportWithColumn = summarizeWeeklyReport(["suite"], new Date("2026-10-01T00:00:00Z"), new Date("2026-10-08T00:00:00Z"), [], [], [], "BKC#40", [{ team: "Team A", x1: 2, x4: 3, extraCounts: [4] }], [], ["X2"], "CPU totals", { team: "Teams", x1: "B1-X1", x4: "B1-X4" });
assert.deepEqual(reportWithColumn.cpuColumns, ["X2"]);
assert.deepEqual(reportWithColumn.cpuBaseLabels, { team: "Teams", x1: "B1-X1", x4: "B1-X4" });
assert.equal(reportWithColumn.cpuBreakdownTitle, "CPU totals");
assert.deepEqual(reportWithColumn.teamPlatformCounts[0].extraCounts, [4]);
assert.deepEqual(weeklyReport.links, customReportLinks);
assert.deepEqual(DEFAULT_WEEKLY_REPORT_LINKS, [customReportLinks[0]]);
assert.equal(DEFAULT_WEEKLY_REPORT_BKC, "BKC#40");
assert.equal(DEFAULT_CPU_BREAKDOWN_TITLE, "DMR X1 and X4 CPU breakdown");
assert.deepEqual(normalizeCpuBaseLabels({ team: " Teams ", x1: "B1-X1", x4: "B1-X4" }), { team: "Teams", x1: "B1-X1", x4: "B1-X4" });
assert.equal(normalizeCpuBaseLabels({ team: "Teams", x1: "teams", x4: "B1-X4" }), null);
assert.equal(normalizeCpuBaseLabels({ team: "Teams", x1: "", x4: "B1-X4" }), null);
assert.equal(normalizeCpuBreakdownTitle("  CPU totals  "), "CPU totals");
assert.equal(normalizeCpuBreakdownTitle(" "), null);
assert.equal(normalizeCpuBreakdownTitle("First\nSecond"), null);
assert.deepEqual(DEFAULT_TEAM_PLATFORM_COUNTS, [
  { team: "PV.BKC", x1: 6, x4: 2 },
  { team: "DM", x1: 2, x4: 0 },
  { team: "DPMO", x1: 9, x4: 5 },
  { team: "Execution", x1: 39, x4: 6 },
]);
assert.equal(DEFAULT_TEAM_PLATFORM_COUNTS.reduce((total, row) => total + row.x1 + row.x4, 0), 69);
assert.equal(normalizeWeeklyReportBkc(" BKC#WW41 "), "BKC#WW41");
assert.equal(normalizeWeeklyReportBkc("BKC#40"), "BKC#40");
assert.equal(normalizeWeeklyReportBkc("WW41"), null);
assert.equal(normalizeWeeklyReportHsdesLink(DEFAULT_WEEKLY_REPORT_HSDES_LINK), DEFAULT_WEEKLY_REPORT_HSDES_LINK);
assert.equal(normalizeWeeklyReportHsdesLink("https://example.com/appstore/generalapps/#/pages/community/1?queryId=123"), null);
assert.deepEqual(normalizeWeeklyReportLinks(customReportLinks), customReportLinks);
assert.deepEqual(normalizeWeeklyReportLinks([]), []);
assert.equal(normalizeWeeklyReportLinks([{ label: "Not secure", url: "http://example.intel.com" }]), null);
assert.equal(canonicalizeSightingDomain("pm_subsystem_validation"), "pv_power_management");
assert.equal(canonicalizeSightingDomain("io_subsystem_validation"), "pv_serial_io");
assert.equal(canonicalizeSightingDomain("managebility_subsystem_validation"), "pv_manageability");
assert.equal(canonicalizeSightingDomain("ras_subsystem_validation"), "pv_ras");
assert.equal(canonicalizeSightingDomain("stability_subsystem_validation"), "pv_reset");
assert.equal(canonicalizeSightingDomain("memory_subsystem_validation"), "pv_memory");
assert.equal(canonicalizeSightingDomain("virtualization_subsystem_validation"), "pv_virtualization");
assert.equal(canonicalizeSightingDomain("unlisted_subsystem_validation"), null);
assert.deepEqual(aggregateHsdesIssueIdsByDomain([
  { id: "sighting-1", report_type: "sighting", team_found: "security_subsystem_validation" },
  { id: "sighting-1", report_type: "sighting", team_found: "security_subsystem_validation" },
  { id: "issue-2", report_type: "test_request", team_found: "security_subsystem_validation" },
  { id: "issue-3", report_type: "presighting", team_found: "pm_subsystem_validation" },
  { id: "issue-4", report_type: "test_request", team_found: "seamless_subsystem_validation" },
  { id: "issue-5", report_type: "sighting", team_found: "io_subsystem_validation" },
  { id: "issue-6", report_type: "presighting", team_found: "managebility_subsystem_validation" },
  { id: "issue-7", report_type: "test_request", team_found: "ras_subsystem_validation" },
  { id: "issue-8", report_type: "sighting", team_found: "stability_subsystem_validation" },
  { id: "issue-9", report_type: "sighting", team_found: "memory_subsystem_validation" },
  { id: "issue-10", report_type: "sighting", team_found: "virtualization_subsystem_validation" },
  { id: "issue-11", report_type: "sighting", team_found: "unlisted_subsystem_validation" },
]), {
  pv_security: 2,
  pv_power_management: 1,
  pv_seamless: 1,
  pv_serial_io: 1,
  pv_manageability: 1,
  pv_ras: 1,
  pv_reset: 1,
  pv_memory: 1,
  pv_virtualization: 1,
});
assert.deepEqual(extractHsdesIssuesOlderThan([
  { id: "late-security", title: "Older security issue", team_found: "security_subsystem_validation", status: "open", days_open: "45" },
  { id: "late-security", title: "Duplicate row", team_found: "security_subsystem_validation", status: "open", days_open: "45" },
  { id: "exactly-30", title: "Boundary issue", team_found: "pm_subsystem_validation", status: "open", days_open: "30" },
  { id: "late-other-domain", title: "Older other issue", team_found: "other_team", status: "implemented", days_open: "31" },
]), [
  { id: "late-security", title: "Older security issue", teamFound: "security_subsystem_validation", domain: "pv_security", status: "open", daysOpen: 45 },
  { id: "late-other-domain", title: "Older other issue", teamFound: "other_team", domain: "other_team", status: "implemented", daysOpen: 31 },
]);
const allIssueRecords = [
  { id: "recent-pm", title: "Recently opened PM issue", team_found: "pm_subsystem_validation", status: "open", days_open: "4" },
  { id: "aged-security", title: "Aged security issue", team_found: "security_subsystem_validation", status: "open", days_open: "45" },
  { id: "recent-pm", title: "Duplicate", team_found: "pm_subsystem_validation", status: "open", days_open: "4" },
];
assert.deepEqual(extractHsdesIssues(allIssueRecords).map(({ id, title, domain }) => ({ id, title, domain })), [
  { id: "recent-pm", title: "Recently opened PM issue", domain: "pv_power_management" },
  { id: "aged-security", title: "Aged security issue", domain: "pv_security" },
]);
assert.deepEqual(extractHsdesIssuesOlderThan(allIssueRecords).map(({ id }) => id), ["aged-security"]);
const pagedIssueRecords = Array.from({ length: 20001 }, (_, index) => ({ id: `paged-${index + 1}` }));
const pageStarts = [];
const collectedHsdesRecords = await collectHsdesQueryPages(async (startAt, maxResults) => {
  pageStarts.push(startAt);
  return { total: pagedIssueRecords.length, data: pagedIssueRecords.slice(startAt - 1, startAt - 1 + maxResults) };
});
assert.equal(collectedHsdesRecords.length, pagedIssueRecords.length);
assert.equal(pageStarts.length, 21);
assert.equal(pageStarts[0], 1);
assert.equal(pageStarts.at(-1), 20001);
assert.deepEqual(normalizeTeamPlatformCounts([{ team: "Team A", x1: 2, x4: 3 }]), [{ team: "Team A", x1: 2, x4: 3 }]);
assert.deepEqual(normalizeCpuColumns([" X2 ", "X8"]), ["X2", "X8"]);
assert.equal(normalizeCpuColumns(["x1"]), null);
assert.equal(normalizeCpuColumns(["X2", "x2"]), null);
assert.deepEqual(normalizeTeamPlatformCounts([{ team: "Team A", x1: 2, x4: 3, extraCounts: [4, 5] }], ["X2", "X8"]), [{ team: "Team A", x1: 2, x4: 3, extraCounts: [4, 5] }]);
assert.equal(normalizeTeamPlatformCounts([{ team: "Team A", x1: 2, x4: 3, extraCounts: [4] }], ["X2", "X8"]), null);
assert.equal(normalizeTeamPlatformCounts([{ team: "Team A", x1: -1, x4: 0 }]), null);
assert.equal(normalizeTeamPlatformCounts([{ team: "Team A", x1: 0, x4: 0 }, { team: "team a", x1: 1, x4: 1 }]), null);
const reportHtml = renderReportHtml({
  meta: {
    runId: "test-run", capturedAt: "2026-10-09T00:00:00Z", filter: { value: "Test Suite" },
    filterVerified: true, appliedCondition: [], stateColumn: "State", warnings: [], durationMs: 0,
  },
  summary: attemptedSummary,
});
assert.match(reportHtml, /Execution Attempted = Passed \+ Failed \+ reruns.*NOT RUN/);
assert.match(reportHtml, /<span>Execution Attempted<\/span><b>3<\/b><small>75%<\/small>/);
assert.match(reportHtml, /<span>Passed<\/span><b>1<\/b><small>25%<\/small>/);
assert.match(reportHtml, /<span>Failed<\/span><b>1<\/b><small>25%<\/small>/);
assert.match(reportHtml, /<span>Blocked<\/span><b>0<\/b><small>0%<\/small>/);
assert.doesNotMatch(reportHtml, /<span>(?:Pass|Fail|Blocked) rate<\/span>/);

const bucketNames = [
  "15019970627",
  "hsd_16031656538",
  "presighting_16031994288",
  "hsd_16031581796_txt_and_tdx",
  "need_to_change_cmdline_parameter",
  "gh_pr_9677_fisher_tests_update",
  "targeted_channel_didnt_failover",
  "debug_ras_in_triage",
  "debug_ras_in_triage; hsd_16031581796_txt_and_tdx",
];
const bucketRows = bucketNames.map((bucketName, index) => ({
  ...rows[0], id: `bucket-${index}`, bucket: "Failed", state: "Failed", domain: "pv_security", bucketName,
}));
const bucketSummary = summarize([...bucketRows, { ...rows[0], id: "unbucketed", bucket: "Failed", domain: "pv_security" }]);
assert.equal(bucketSummary.bucketized, 9);
assert.equal(bucketSummary.bucketizedWithHsd, 5);
assert.equal(bucketSummary.bucketizedWithoutHsd, 4);
assert.equal(bucketSummary.byDomain[0].bucketizedWithHsd + bucketSummary.byDomain[0].bucketizedWithoutHsd, bucketSummary.byDomain[0].bucketized);

const octoberWeeks = getWorkWeeks(new Date("2026-10-08T06:00:00Z"));
assert.equal(octoberWeeks.year, 2026);
assert.equal(octoberWeeks.weeks[0].label, "WW41");
assert.equal(octoberWeeks.weeks[0].from.toISOString(), "2026-10-04T18:30:00.000Z");
assert.equal(octoberWeeks.weeks[0].to.toISOString(), "2026-10-08T06:00:00.000Z");
assert.equal(octoberWeeks.weeks[1].label, "WW40");
assert.equal(octoberWeeks.weeks[1].to.toISOString(), "2026-10-04T18:30:00.000Z");
assert.equal(octoberWeeks.weeks.at(-1).label, "WW01");
const newYearWeeks = getWorkWeeks(new Date("2020-12-31T20:00:00Z"));
assert.equal(newYearWeeks.year, 2020);
assert.equal(newYearWeeks.weeks[0].label, "WW53");

console.log(`OK - ${cases.length} bucket cases + harvest/summarize checks passed`);
