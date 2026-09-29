import { request as undiciRequest } from "undici";
import { config } from "./config";
import { getNgaiApiToken } from "./ngai-token";
import { resolveDispatcher } from "./proxy";

export type ExecutionTimeSummary = {
  subsystemName: string;
  totalTestCount: number;
  includedTestCount: number;
  excludedTestCount: number;
  totalSeconds: number;
  configurations: ExecutionTimeConfiguration[];
};

export type ExecutionTimeConfiguration = {
  configurationName: string;
  totalTestCount: number;
  includedTestCount: number;
  excludedTestCount: number;
  totalSeconds: number;
};

type ExecutionRecord = {
  testStartDateTime?: unknown;
  testEndDateTime?: unknown;
  validationGroupId?: unknown;
  validationGroup?: { testGroupName?: unknown };
  station?: { config?: { configName?: unknown } };
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

function escapeOData(value: string) {
  return value.replace(/'/g, "''");
}

function buildUrl(suiteName: string, skip: number) {
  const normalizedSuite = escapeOData(suiteName.trim().toLowerCase());
  const url = new URL(config.ngaiApiUrl);
  url.pathname = url.pathname.replace(/\/TestRunComposite\/?$/, "/TestRunComposite");
  url.searchParams.set(
    "$filter",
    [
      "NonTriageLatestRunFlag eq true",
      `((tolower(TestLine/TestSuite/TestSuiteName) eq '${normalizedSuite}') or (tolower(TestLineRevision/TestSuite/TestSuiteName) eq '${normalizedSuite}'))`,
    ].join(" and "),
  );
  url.searchParams.set("$count", "true");
  url.searchParams.set("$top", String(PAGE_SIZE));
  if (skip > 0) url.searchParams.set("$skip", String(skip));
  url.searchParams.set("$select", "TestStartDateTime,TestEndDateTime,ValidationGroupId");
  url.searchParams.set("$expand", "ValidationGroup($select=TestGroupName),Station($expand=Config($select=ConfigName))");
  return url;
}

function recordsFromPayload(payload: unknown): ExecutionRecord[] {
  if (Array.isArray(payload)) return payload as ExecutionRecord[];
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as { value?: unknown }).value;
  return Array.isArray(value) ? value as ExecutionRecord[] : [];
}

export async function summarizeExecutionTime(suiteName: string): Promise<ExecutionTimeSummary[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  const apiToken = await getNgaiApiToken();
  if (apiToken) headers["X-NGA-PAT"] = apiToken;
  if (config.ngaiCookie) headers.cookie = config.ngaiCookie;

  const records: ExecutionRecord[] = [];
  const dispatcher = resolveDispatcher();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await undiciRequest(buildUrl(suiteName, page * PAGE_SIZE), {
      method: "GET",
      headers,
      dispatcher,
      headersTimeout: config.ngaiTimeoutMs,
      bodyTimeout: config.ngaiTimeoutMs,
    });
    const body = await response.body.text();
    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new Error("Intel NGAi rejected the request. Check the configured NGAi token or cookie.");
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Intel NGAi execution-time request failed (${response.statusCode}).`);
    }
    const payload = JSON.parse(body) as { value?: unknown; "@odata.count"?: unknown };
    const batch = recordsFromPayload(payload);
    records.push(...batch);
    const total = typeof payload["@odata.count"] === "number" ? payload["@odata.count"] : null;
    if (batch.length < PAGE_SIZE || (total != null && records.length >= total)) break;
  }

  type Metrics = Omit<ExecutionTimeConfiguration, "configurationName">;
  type GroupedMetrics = Metrics & { configurations: Map<string, Metrics> };
  const grouped = new Map<string, GroupedMetrics>();
  for (const record of records) {
    const subsystemName = typeof record.validationGroup?.testGroupName === "string"
      ? record.validationGroup.testGroupName
      : typeof record.validationGroupId === "string" ? record.validationGroupId : "Unknown";
    const configurationName = typeof record.station?.config?.configName === "string"
      ? record.station.config.configName
      : "Unknown configuration";
    const current = grouped.get(subsystemName) ?? {
      totalTestCount: 0,
      includedTestCount: 0,
      excludedTestCount: 0,
      totalSeconds: 0,
      configurations: new Map<string, Metrics>(),
    };
    const configuration = current.configurations.get(configurationName) ?? {
      totalTestCount: 0,
      includedTestCount: 0,
      excludedTestCount: 0,
      totalSeconds: 0,
    };
    current.totalTestCount += 1;
    configuration.totalTestCount += 1;
    const start = typeof record.testStartDateTime === "string" ? Date.parse(record.testStartDateTime) : Number.NaN;
    const end = typeof record.testEndDateTime === "string" ? Date.parse(record.testEndDateTime) : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      current.excludedTestCount += 1;
      configuration.excludedTestCount += 1;
    } else {
      current.includedTestCount += 1;
      configuration.includedTestCount += 1;
      current.totalSeconds += (end - start) / 1000;
      configuration.totalSeconds += (end - start) / 1000;
    }
    current.configurations.set(configurationName, configuration);
    grouped.set(subsystemName, current);
  }

  return [...grouped.entries()]
    .map(([subsystemName, summary]) => ({
      subsystemName,
      totalTestCount: summary.totalTestCount,
      includedTestCount: summary.includedTestCount,
      excludedTestCount: summary.excludedTestCount,
      totalSeconds: summary.totalSeconds,
      configurations: [...summary.configurations.entries()]
        .map(([configurationName, metrics]) => ({ configurationName, ...metrics }))
        .sort((left, right) => left.configurationName.localeCompare(right.configurationName)),
    }))
    .sort((left, right) => left.subsystemName.localeCompare(right.subsystemName));
}
