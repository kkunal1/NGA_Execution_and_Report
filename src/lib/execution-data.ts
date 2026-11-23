import { request as undiciRequest } from "undici";
import { config } from "./config";
import { getNgaiApiToken } from "./ngai-token";
import { resolveDispatcher } from "./proxy";
import { baseExecutionConfigName } from "./execution-data-view";

export type ExecutionAttempt = { runId: string; rerunIndex: number | null; state: string; stationId: string | null; stationName: string | null; systemId: string | null; systemName: string | null; configName?: string | null; start: string; end: string | null; seconds: number | null };
export type ExecutionDataTest = { id: string; name: string; suite: string; attempts: ExecutionAttempt[]; totalSeconds: number; missingDurations: number; systems: string[] };
export type ExecutionDataDomain = { name: string; tests: ExecutionDataTest[]; attempts: number; totalSeconds: number; missingDurations: number; systems: string[] };
export type PlannedConfigurations = { count: number; missingTestLines: number };
export type ExecutionDataResult = { domains: ExecutionDataDomain[]; totalTests: number; totalAttempts: number; totalSeconds: number; missingDurations: number; unknownStationAttempts: number; unknownSystemAttempts: number; systems: string[]; warnings: string[]; cycleName?: string; suiteNames?: string[]; plannedConfigurations?: PlannedConfigurations | null };
type RunRecord = Record<string, unknown>;
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

function value(record: RunRecord, lower: string, upper: string) { return record[lower] ?? record[upper]; }
function object(input: unknown): RunRecord { return input && typeof input === "object" && !Array.isArray(input) ? input as RunRecord : {}; }
function text(input: unknown): string { return typeof input === "string" || typeof input === "number" ? String(input).trim() : ""; }
function systemLabel(id: string | null, name: string | null) { return name ? `${name}${id ? ` (${id})` : ""}` : `System ${id}`; }
function uniqueSystems(attempts: ExecutionAttempt[]) {
  const stations = new Map<string, string>();
  for (const attempt of attempts) {
    const key = attempt.systemId ? `id:${attempt.systemId.toLowerCase()}` : attempt.systemName ? `name:${attempt.systemName.toLowerCase()}` : null;
    if (key) stations.set(key, systemLabel(attempt.systemId, attempt.systemName));
  }
  return [...stations.values()].sort();
}

export function aggregateExecutionData(records: Array<{ suite: string; record: RunRecord }>): ExecutionDataResult {
  const grouped = new Map<string, Map<string, ExecutionDataTest>>();
  const seenRuns = new Set<string>();
  const allSystems = new Map<string, string>();
  let unknownStationAttempts = 0;
  let unknownSystemAttempts = 0;
  let missingIds = 0;
  for (const { suite, record } of records) {
    const start = text(value(record, "testStartDateTime", "TestStartDateTime"));
    const startTime = Date.parse(start);
    if (!start || !Number.isFinite(startTime)) continue;
    const runId = text(value(record, "testRunId", "TestRunId"));
    const lineId = text(value(record, "testLineId", "TestLineId"));
    if (!runId || !lineId) { missingIds++; continue; }
    if (seenRuns.has(runId)) continue;
    seenRuns.add(runId);
    const line = object(value(record, "testLine", "TestLine"));
    const group = object(value(record, "validationGroup", "ValidationGroup"));
    const station = object(value(record, "station", "Station"));
    const stationConfig = object(value(station, "config", "Config"));
    const domain = text(value(group, "testGroupName", "TestGroupName")) || text(value(record, "validationGroupId", "ValidationGroupId")) || "Unknown domain";
    const name = text(value(line, "testLineName", "TestLineName")) || `Test line ${lineId}`;
    const stationId = text(value(record, "stationId", "StationId")) || null;
    const stationName = text(value(station, "stationName", "StationName")) || null;
    const configName = text(value(stationConfig, "configName", "ConfigName")) || null;
    if (!stationId && !stationName) unknownStationAttempts++;
    const systemValue = value(station, "system", "System");
    const systemRecords = Array.isArray(systemValue) ? systemValue : systemValue ? [systemValue] : [];
    const uniqueMappings = new Map<string, { id: string | null; name: string | null }>();
    for (const rawSystem of systemRecords) {
      const system = object(rawSystem);
      const id = text(value(system, "systemId", "SystemId")) || null;
      const name = text(value(system, "systemName", "SystemName")) || null;
      const key = id ? `id:${id.toLowerCase()}` : name ? `name:${name.toLowerCase()}` : null;
      if (key) uniqueMappings.set(key, { id, name });
    }
    const mapping = uniqueMappings.size === 1 ? [...uniqueMappings.values()][0] : undefined;
    const systemId = mapping?.id ?? null;
    const systemName = mapping?.name ?? null;
    const systemKey = systemId ? `id:${systemId.toLowerCase()}` : systemName ? `name:${systemName.toLowerCase()}` : null;
    if (systemKey) allSystems.set(systemKey, systemLabel(systemId, systemName)); else unknownSystemAttempts++;
    const end = text(value(record, "testEndDateTime", "TestEndDateTime")) || null;
    const endTime = end ? Date.parse(end) : Number.NaN;
    const seconds = Number.isFinite(endTime) && endTime >= startTime ? (endTime - startTime) / 1000 : null;
    const rawIndex = value(record, "rerunIndex", "RerunIndex");
    const parsedIndex = rawIndex == null || rawIndex === "" ? Number.NaN : Number(rawIndex);
    const attempt: ExecutionAttempt = { runId, rerunIndex: Number.isFinite(parsedIndex) ? parsedIndex : null, state: text(value(record, "state", "State")) || "Unknown", stationId, stationName, systemId, systemName, configName, start, end, seconds };
    const tests = grouped.get(domain) ?? new Map<string, ExecutionDataTest>();
    const key = `${suite.toLowerCase()}\0${lineId.toLowerCase()}`;
    const test = tests.get(key) ?? { id: lineId, name, suite, attempts: [], totalSeconds: 0, missingDurations: 0, systems: [] };
    test.attempts.push(attempt);
    if (seconds === null) test.missingDurations++; else test.totalSeconds += seconds;
    tests.set(key, test);
    grouped.set(domain, tests);
  }
  const domains = [...grouped].map(([name, tests]) => {
    const rows = [...tests.values()].sort((left, right) => left.name.localeCompare(right.name) || left.suite.localeCompare(right.suite));
    for (const test of rows) {
      test.attempts.sort((left, right) => left.start.localeCompare(right.start) || left.runId.localeCompare(right.runId));
      test.systems = uniqueSystems(test.attempts);
    }
    return { name, tests: rows, attempts: rows.reduce((sum, test) => sum + test.attempts.length, 0), totalSeconds: rows.reduce((sum, test) => sum + test.totalSeconds, 0), missingDurations: rows.reduce((sum, test) => sum + test.missingDurations, 0), systems: uniqueSystems(rows.flatMap((test) => test.attempts)) };
  }).sort((left, right) => left.name.localeCompare(right.name));
  return { domains, totalTests: domains.reduce((sum, domain) => sum + domain.tests.length, 0), totalAttempts: seenRuns.size, totalSeconds: domains.reduce((sum, domain) => sum + domain.totalSeconds, 0), missingDurations: domains.reduce((sum, domain) => sum + domain.missingDurations, 0), unknownStationAttempts, unknownSystemAttempts, systems: [...allSystems.values()].sort(), warnings: missingIds ? [`${missingIds} started records without a run or test line ID were excluded.`] : [] };
}

export function executionHistoryUrl(suite: string, skip: number): URL {
  const normalized = suite.trim().toLowerCase().replace(/'/g, "''");
  const url = new URL(config.ngaiApiUrl);
  url.searchParams.set("$filter", `((tolower(TestLine/TestSuite/TestSuiteName) eq '${normalized}') or (tolower(TestLineRevision/TestSuite/TestSuiteName) eq '${normalized}')) and TestStartDateTime ne null`);
  url.searchParams.set("$count", "true");
  url.searchParams.set("$top", String(PAGE_SIZE));
  url.searchParams.set("$orderby", "TestRunId");
  if (skip) url.searchParams.set("$skip", String(skip));
  url.searchParams.set("$select", "TestRunId,TestLineId,State,RerunIndex,StationId,StationRevisionNumber,TestStartDateTime,TestEndDateTime,ValidationGroupId");
  url.searchParams.set("$expand", "Station($select=StationName;$expand=Config($select=ConfigName),System($select=SystemId,SystemName)),ValidationGroup($select=TestGroupName),TestLine($select=TestLineName)");
  return url;
}

export function plannedConfigurationsUrl(suite: string, skip: number): URL {
  const url = new URL(config.ngaiApiUrl);
  url.pathname = url.pathname.replace(/\/TestRunComposite\/?$/, "/TestLine");
  url.searchParams.set("$filter", `TestSuite/TestSuiteName eq '${suite.trim().replace(/'/g, "''")}'`);
  url.searchParams.set("$select", "TestLineId");
  url.searchParams.set("$expand", "Config($select=ConfigName)");
  url.searchParams.set("$orderby", "TestLineId");
  url.searchParams.set("$count", "true");
  url.searchParams.set("$top", String(PAGE_SIZE));
  if (skip) url.searchParams.set("$skip", String(skip));
  return url;
}

export function summarizePlannedConfigurations(records: RunRecord[]): PlannedConfigurations {
  const configurations = new Set<string>();
  let missingTestLines = 0;
  for (const record of records) {
    const configRecord = object(value(record, "config", "Config"));
    const name = text(value(configRecord, "configName", "ConfigName"));
    if (!name) { missingTestLines++; continue; }
    configurations.add(baseExecutionConfigName(name).toLowerCase());
  }
  return { count: configurations.size, missingTestLines };
}

export async function fetchPlannedConfigurations(suites: string[]): Promise<PlannedConfigurations> {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = await getNgaiApiToken();
  if (token) headers["X-NGA-PAT"] = token;
  if (config.ngaiCookie) headers.cookie = config.ngaiCookie;
  const dispatcher = resolveDispatcher();
  const records: RunRecord[] = [];
  for (const suite of suites) {
    let completed = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await undiciRequest(plannedConfigurationsUrl(suite, page * PAGE_SIZE), { method: "GET", headers, dispatcher, headersTimeout: config.ngaiTimeoutMs, bodyTimeout: config.ngaiTimeoutMs });
      const body = await response.body.text();
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`NGAi planned configuration query failed for ${suite} (HTTP ${response.statusCode}).`);
      const payload = JSON.parse(body) as { value?: unknown; "@odata.count"?: unknown };
      if (!Array.isArray(payload.value) || payload.value.some((record) => !record || typeof record !== "object" || Array.isArray(record))) throw new Error(`NGAi returned invalid planned configuration data for ${suite}.`);
      records.push(...payload.value as RunRecord[]);
      const total = typeof payload["@odata.count"] === "number" ? payload["@odata.count"] : null;
      const fetched = page * PAGE_SIZE + payload.value.length;
      if (payload.value.length < PAGE_SIZE || (total !== null && fetched >= total)) {
        if (total !== null && fetched < total) throw new Error(`NGAi returned incomplete planned configuration data for ${suite}.`);
        completed = true;
        break;
      }
    }
    if (!completed) throw new Error(`NGAi planned configuration data for ${suite} exceeds the ${MAX_PAGES * PAGE_SIZE} test line limit.`);
  }
  return summarizePlannedConfigurations(records);
}

export async function fetchExecutionHistory(suites: string[]): Promise<ExecutionDataResult> {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = await getNgaiApiToken();
  if (token) headers["X-NGA-PAT"] = token;
  if (config.ngaiCookie) headers.cookie = config.ngaiCookie;
  const dispatcher = resolveDispatcher();
  const records: Array<{ suite: string; record: RunRecord }> = [];
  for (const suite of suites) {
    let completed = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await undiciRequest(executionHistoryUrl(suite, page * PAGE_SIZE), { method: "GET", headers, dispatcher, headersTimeout: config.ngaiTimeoutMs, bodyTimeout: config.ngaiTimeoutMs });
      const body = await response.body.text();
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`NGAi history query failed for ${suite} (HTTP ${response.statusCode}).`);
      const payload = JSON.parse(body) as { value?: unknown; "@odata.count"?: unknown };
      if (!Array.isArray(payload.value)) throw new Error(`NGAi returned an invalid history response for ${suite}.`);
      records.push(...payload.value.filter((record): record is RunRecord => !!record && typeof record === "object" && !Array.isArray(record)).map((record) => ({ suite, record })));
      const total = typeof payload["@odata.count"] === "number" ? payload["@odata.count"] : null;
      if (payload.value.length < PAGE_SIZE || (total !== null && (page + 1) * PAGE_SIZE >= total)) { completed = true; break; }
    }
    if (!completed) throw new Error(`NGAi history for ${suite} exceeds the ${MAX_PAGES * PAGE_SIZE} run limit; no partial totals were returned.`);
  }
  return aggregateExecutionData(records);
}