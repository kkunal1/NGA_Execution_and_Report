import { request as undiciRequest } from "undici";
import { config } from "./config";
import { getNgaiApiToken } from "./ngai-token";
import { bucketOf } from "./normalize";
import { resolveDispatcher } from "./proxy";
import type { AgedHsdesIssue, HsdesIssue } from "./hsdes-sightings";
import type { WeeklyReportSectionSettings } from "./dashboard-settings";
import { DEFAULT_CPU_BASE_LABELS, DEFAULT_CPU_BREAKDOWN_TITLE, DEFAULT_TEAM_PLATFORM_COUNTS, DEFAULT_WEEKLY_REPORT_BKC, DEFAULT_WEEKLY_REPORT_LINKS, type CpuBaseLabels, type TeamPlatformCount, type WeeklyReportLink } from "./weekly-report-settings";

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export const STAGES = ["Preboot", "RebootStation", "PreTest", "Test", "PostTest", "Cleanup", "Other"] as const;
export type Stage = (typeof STAGES)[number];

type Failure = {
  failureId?: string;
  stageName?: string | null;
  sightingId?: string | null;
  subState?: string | null;
  description?: string | null;
  bucket?: { bucketName?: string | null } | null;
  testStep?: { testStepName?: string | null } | null;
};

type Run = {
  testRunId?: string;
  testLineId?: string;
  testEndDateTime?: string | null;
  state?: string;
  rerunIndex?: number | null;
  isTriageFlag?: boolean;
  validationGroup?: { testGroupName?: string | null } | null;
  autoDisablingTestStep?: { testStepName?: string | null } | null;
  testLine?: { testLineName?: string | null; goStatus?: string | null; config?: { configName?: string | null } | null } | null;
  failure?: Failure[] | null;
};

type TestLine = {
  testLineId?: string;
  goStatus?: string;
  allowAutomationFlag?: boolean;
};

export type FailureRow = {
  group: string;
  stages: Record<Stage, number>;
  total: number;
  attached: number;
};

export type HsdFailureSummary = {
  hsdId: string;
  failedRuns: number;
  domains: { domain: string; failedRuns: number }[];
};

export type StageDetail = {
  stage: Stage;
  group: string;
  config: string;
  testLine: string;
  step: string;
  subState: string;
  count: number;
};

export type WeeklyReportDomainSummary = {
  domain: string;
  tests: number;
  passed: number;
  passRatePct: number;
  failed: number;
  bucketized: number;
  bucketizedWithHsd: number;
  bucketizedUnderTriage: number;
  bucketizedNoHsd: number;
  blocked: number;
  notRun: number;
};

export type WeeklyReport = {
  generatedAt: string;
  suites: string[];
  from: string;
  to: string;
  planned: number;
  latestPassed: number;
  latestFailed: number;
  latestRerunPendingRunning: number;
  blockedLines: number;
  latestInProgress: number;
  latestNotRun: number;
  domainSummary: WeeklyReportDomainSummary[];
  sectionVisibility?: WeeklyReportSectionSettings;
  validRuns: number;
  triageRuns: number;
  validLines: number;
  passedLines: number;
  failedLines: number;
  windowFailures: FailureRow[];
  backlogFailures: FailureRow[];
  hsdFailureSummaries: HsdFailureSummary[];
  prebootAbortCounts: Record<string, number>;
  runningBkc: string;
  teamPlatformCounts: TeamPlatformCount[];
  cpuColumns: string[];
  cpuBaseLabels: CpuBaseLabels;
  cpuBreakdownTitle: string;
  links: WeeklyReportLink[];
  sightingWarning?: string;
  hsdesIssues: HsdesIssue[];
  agedHsdesIssues: AgedHsdesIssue[];
  hsdFailureTitles?: Record<string, string>;
  hsdFailureStatuses?: Record<string, string>;
  stageDetails: StageDetail[];
};

function stageOf(value: string | null | undefined): Stage {
  const stage = (value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (stage === "preboot") return "Preboot";
  if (stage === "rebootstation") return "RebootStation";
  if (stage === "pretest") return "PreTest";
  if (stage === "test") return "Test";
  if (stage === "posttest") return "PostTest";
  if (stage === "cleanup") return "Cleanup";
  return "Other";
}

const escaped = (text: string) => text.replace(/'/g, "''");
const suiteFilter = (suite: string) => `TestLine/TestSuite/TestSuiteName eq '${escaped(suite)}'`;

async function fetchRecords<T>(buildUrl: (skip: number) => URL, headers: Record<string, string>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await undiciRequest(buildUrl(page * PAGE_SIZE), {
      method: "GET",
      headers,
      dispatcher: resolveDispatcher(),
      headersTimeout: config.ngaiTimeoutMs,
      bodyTimeout: config.ngaiTimeoutMs,
    });
    const body = await response.body.text();
    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new Error("Intel NGAi rejected the request. Check the configured token or cookie.");
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Intel NGAi report request failed (${response.statusCode}): ${body.slice(0, 300)}`);
    }
    const payload = JSON.parse(body) as { value?: T[]; "@odata.count"?: number } | T[];
    const batch = Array.isArray(payload) ? payload : payload.value ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE || (!Array.isArray(payload) && payload["@odata.count"] != null && rows.length >= payload["@odata.count"])) return rows;
  }
  throw new Error("Report query exceeded its pagination limit. Choose a shorter date range.");
}

function buildUrl(entity: "TestLine" | "TestRunComposite", filter: string, expand: string, select: string, skip: number) {
  const url = new URL(config.ngaiApiUrl);
  url.pathname = url.pathname.replace(/\/TestRunComposite\/?$/, `/${entity}`);
  url.searchParams.set("$filter", filter);
  url.searchParams.set("$count", "true");
  url.searchParams.set("$top", String(PAGE_SIZE));
  if (skip) url.searchParams.set("$skip", String(skip));
  url.searchParams.set("$select", select);
  if (expand) url.searchParams.set("$expand", expand);
  return url;
}

function failureRows(runs: Run[]): FailureRow[] {
  const grouped = new Map<string, FailureRow>();
  for (const run of runs) {
    if (run.state !== "Failed") continue;
    const group = run.validationGroup?.testGroupName || "Unknown";
    const row = grouped.get(group) ?? {
      group,
      stages: { Preboot: 0, RebootStation: 0, PreTest: 0, Test: 0, PostTest: 0, Cleanup: 0, Other: 0 },
      total: 0,
      attached: 0,
    };
    for (const failure of run.failure?.length ? run.failure : [{}]) {
      row.stages[stageOf(failure.stageName)]++;
      row.total++;
      if (failure.sightingId) row.attached++;
    }
    grouped.set(group, row);
  }
  return [...grouped.values()].sort((a, b) => b.total - a.total || a.group.localeCompare(b.group));
}

function hsdFailureSummaries(runs: Run[]): HsdFailureSummary[] {
  const counts = new Map<string, Map<string, number>>();
  for (const run of runs) {
    if (bucketOf(run.state ?? "", run.testLine?.goStatus ?? "") !== "Failed") continue;
    const domain = run.validationGroup?.testGroupName || "Unknown";
    const hsdIds = new Set((run.failure ?? []).flatMap((failure) => failure.bucket?.bucketName?.match(/\d{10,}/g) ?? []));
    for (const hsdId of hsdIds) {
      const domainCounts = counts.get(hsdId) ?? new Map<string, number>();
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      counts.set(hsdId, domainCounts);
    }
  }
  return [...counts.entries()]
    .map(([hsdId, domainCounts]) => {
      const domains = [...domainCounts.entries()]
        .map(([domain, failedRuns]) => ({ domain, failedRuns }))
        .sort((a, b) => b.failedRuns - a.failedRuns || a.domain.localeCompare(b.domain));
      return { hsdId, failedRuns: domains.reduce((total, domain) => total + domain.failedRuns, 0), domains };
    })
    .sort((a, b) => b.failedRuns - a.failedRuns || a.hsdId.localeCompare(b.hsdId));
}

function detailsFor(runs: Run[]): StageDetail[] {
  const grouped = new Map<string, StageDetail>();
  for (const run of runs) {
    if (run.state !== "Failed") continue;
    for (const failure of run.failure?.length ? run.failure : [{}]) {
      const stage = stageOf(failure.stageName);
      const group = run.validationGroup?.testGroupName || "Unknown";
      const configName = run.testLine?.config?.configName || "Unknown configuration";
      const testLine = run.testLine?.testLineName || run.testLineId || "Unknown test line";
      const step = failure.testStep?.testStepName || "Unknown step";
      const subState = failure.subState || "Unknown";
      const key = JSON.stringify([stage, group, configName, testLine, step, subState]);
      const detail = grouped.get(key) ?? { stage, group, config: configName, testLine, step, subState, count: 0 };
      detail.count++;
      grouped.set(key, detail);
    }
  }
  return [...grouped.values()].sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || b.count - a.count);
}

function prebootAbortCounts(runs: Run[]): Record<string, number> {
  const grouped = new Map<string, number>();
  for (const run of runs) {
    if (run.state !== "Aborted") continue;
    const step = (run.autoDisablingTestStep?.testStepName ?? "").replace(/_pv$/i, "").toLowerCase();
    if (!/^hpreboot_update(?:sut|nuc)collateral$/.test(step)) continue;
    const group = run.validationGroup?.testGroupName || "Unknown";
    grouped.set(group, (grouped.get(group) ?? 0) + 1);
  }
  return Object.fromEntries([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function summarizeWeeklyReport(suites: string[], from: Date, to: Date, windowRuns: Run[], latestRuns: Run[], abortedRuns: Run[] = [], runningBkc = DEFAULT_WEEKLY_REPORT_BKC, teamPlatformCounts: TeamPlatformCount[] = DEFAULT_TEAM_PLATFORM_COUNTS, links: WeeklyReportLink[] = DEFAULT_WEEKLY_REPORT_LINKS, cpuColumns: string[] = [], cpuBreakdownTitle = DEFAULT_CPU_BREAKDOWN_TITLE, cpuBaseLabels: CpuBaseLabels = DEFAULT_CPU_BASE_LABELS): WeeklyReport {
  const latestValid = latestRuns;
  const latestBucket = (run: Run) => bucketOf(run.state ?? "", run.testLine?.goStatus ?? "");
  const domainRuns = new Map<string, Run[]>();
  for (const run of latestValid) {
    const domain = run.validationGroup?.testGroupName || "Unknown";
    const runs = domainRuns.get(domain) ?? [];
    runs.push(run);
    domainRuns.set(domain, runs);
  }
  const domainSummary: WeeklyReportDomainSummary[] = [...domainRuns.entries()].map(([domain, runs]) => {
    const buckets = runs.map(latestBucket);
    const failedRuns = runs.filter((run, index) => buckets[index] === "Failed");
    let bucketizedWithHsd = 0;
    let bucketizedUnderTriage = 0;
    let bucketizedNoHsd = 0;
    for (const run of failedRuns) {
      const bucketNames = (run.failure ?? []).map((failure) => failure.bucket?.bucketName?.trim() ?? "").filter(Boolean);
      if (bucketNames.some((name) => /\d{10,}/.test(name))) bucketizedWithHsd++;
      else if (bucketNames.length) bucketizedUnderTriage++;
      else bucketizedNoHsd++;
    }
    const passed = buckets.filter((bucket) => bucket === "Passed").length;
    return {
      domain,
      tests: runs.length,
      passed,
      passRatePct: runs.length ? Math.round((passed / runs.length) * 1000) / 10 : 0,
      failed: failedRuns.length,
      bucketized: failedRuns.length,
      bucketizedWithHsd,
      bucketizedUnderTriage,
      bucketizedNoHsd,
      blocked: buckets.filter((bucket) => bucket === "Blocked").length,
      notRun: buckets.filter((bucket) => bucket === "Not Run").length,
    };
  }).sort((a, b) => b.tests - a.tests || a.domain.localeCompare(b.domain));
  const recent = windowRuns.filter((run) => run.testLineId && (run.state === "Passed" || run.state === "Failed"));
  const valid = recent.filter((run) => !run.isTriageFlag);
  const latestInWindow = new Map<string, Run>();
  for (const run of valid) {
    const prior = latestInWindow.get(run.testLineId!);
    if (!prior || (run.testEndDateTime ?? "") > (prior.testEndDateTime ?? "")) latestInWindow.set(run.testLineId!, run);
  }
  const linesInWindow = [...latestInWindow.values()];
  return {
    generatedAt: new Date().toISOString(),
    suites,
    from: from.toISOString(),
    to: to.toISOString(),
    planned: latestValid.length,
    latestPassed: latestValid.filter((run) => latestBucket(run) === "Passed").length,
    latestFailed: latestValid.filter((run) => latestBucket(run) === "Failed").length,
    latestRerunPendingRunning: latestValid.filter((run) => (run.rerunIndex ?? 0) > 0 && /^pending(running|gatekeepers?)$/.test(run.state?.trim().toLowerCase() ?? "")).length,
    blockedLines: latestValid.filter((run) => latestBucket(run) === "Blocked").length,
    latestInProgress: latestValid.filter((run) => latestBucket(run) === "In Progress").length,
    latestNotRun: latestValid.filter((run) => latestBucket(run) === "Not Run").length,
    domainSummary,
    validRuns: valid.length,
    triageRuns: recent.length - valid.length,
    validLines: linesInWindow.length,
    passedLines: linesInWindow.filter((run) => run.state === "Passed").length,
    failedLines: linesInWindow.filter((run) => run.state === "Failed").length,
    windowFailures: failureRows(linesInWindow),
    backlogFailures: failureRows(latestValid),
    hsdFailureSummaries: hsdFailureSummaries(latestValid),
    prebootAbortCounts: prebootAbortCounts(abortedRuns),
    runningBkc,
    teamPlatformCounts: teamPlatformCounts.map((row) => ({ ...row, ...(row.extraCounts ? { extraCounts: [...row.extraCounts] } : {}) })),
    cpuColumns: [...cpuColumns],
    cpuBaseLabels: { ...cpuBaseLabels },
    cpuBreakdownTitle,
    links: links.map((link) => ({ ...link })),
    hsdesIssues: [],
    agedHsdesIssues: [],
    stageDetails: detailsFor(linesInWindow),
  };
}

export async function generateWeeklyReport(suites: string[], from: Date, to: Date, runningBkc = DEFAULT_WEEKLY_REPORT_BKC, teamPlatformCounts: TeamPlatformCount[] = DEFAULT_TEAM_PLATFORM_COUNTS, links: WeeklyReportLink[] = DEFAULT_WEEKLY_REPORT_LINKS, cpuColumns: string[] = [], cpuBreakdownTitle = DEFAULT_CPU_BREAKDOWN_TITLE, cpuBaseLabels: CpuBaseLabels = DEFAULT_CPU_BASE_LABELS): Promise<WeeklyReport> {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = await getNgaiApiToken();
  if (token) headers["X-NGA-PAT"] = token;
  if (config.ngaiCookie) headers.cookie = config.ngaiCookie;
  const datasets = await Promise.all(suites.map(async (suite) => {
    const filter = suiteFilter(suite);
    const lineFilter = `TestSuite/TestSuiteName eq '${escaped(suite)}'`;
    const runSelect = "TestRunId,TestLineId,State,RerunIndex,TestEndDateTime,IsTriageFlag";
    const runExpand = "ValidationGroup($select=TestGroupName),TestLine($select=TestLineName,GoStatus;$expand=Config($select=ConfigName)),Failure($select=FailureId,StageName,SightingId,SubState;$expand=Bucket($select=BucketName),TestStep($select=TestStepName))";
    const abortedFilter = `State eq 'Aborted' and ${filter}`;
    const abortedExpand = "ValidationGroup($select=TestGroupName),AutoDisablingTestStep($select=TestStepName)";
    return Promise.all([
      fetchRecords<TestLine>((skip) => buildUrl("TestLine", lineFilter, "", "TestLineId,GoStatus,AllowAutomationFlag", skip), headers),
      fetchRecords<Run>((skip) => buildUrl("TestRunComposite", `${filter} and TestEndDateTime ge ${from.toISOString()} and TestEndDateTime lt ${to.toISOString()}`, runExpand, runSelect, skip), headers),
      fetchRecords<Run>((skip) => buildUrl("TestRunComposite", `${filter} and NonTriageLatestRunFlag eq true`, runExpand, runSelect, skip), headers),
      fetchRecords<Run>((skip) => buildUrl("TestRunComposite", abortedFilter, abortedExpand, "TestRunId,State,ValidationGroupId,AutoDisablingTestStepId", skip), headers),
    ]);
  }));
  const missing = datasets.findIndex(([lines]) => lines.length === 0);
  if (missing >= 0) throw new Error(`No test lines found for suite "${suites[missing]}" in this NGAi project.`);
  return summarizeWeeklyReport(suites, from, to, datasets.flatMap((item) => item[1]), datasets.flatMap((item) => item[2]), datasets.flatMap((item) => item[3]), runningBkc, teamPlatformCounts, links, cpuColumns, cpuBreakdownTitle, cpuBaseLabels);
}