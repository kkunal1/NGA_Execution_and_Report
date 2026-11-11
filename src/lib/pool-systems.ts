import { request as undiciRequest } from "undici";
import { config } from "./config";
import { getNgaiApiToken } from "./ngai-token";
import { getPoolSystemSettings } from "./pool-system-settings";
import { getConfigCoverageSettings, type ConfigCoverageMapping } from "./config-coverage-settings";
import { resolveDispatcher } from "./proxy";
export { B0_SUITES, B2_SUITES } from "./execution-suites";

export type PoolSystem = {
  id: string;
  name: string;
  config: string;
  executionStatus: string;
  activity: string;
  notes: string;
};

type SystemRecord = {
  systemId?: unknown;
  systemName?: unknown;
  station?: {
    executionState?: unknown;
    notes?: unknown;
    config?: { configName?: unknown };
    activity?: { activityName?: unknown };
  };
};

export function poolMembershipFilter(poolNames: string[], path: string): string {
  const matches = poolNames.map((name) => `p/Pool/PoolName eq '${name.replace(/'/g, "''")}'`);
  return `${path}/any(p: ${matches.join(" or ")})`;
}

function systemsUrl(poolNames: string[], skip: number) {
  const url = new URL(config.ngaiApiUrl);
  url.pathname = url.pathname.replace(/\/TestRunComposite\/?$/, "/System");
  url.searchParams.set("$filter", poolMembershipFilter(poolNames, "Station/LatestStationPool"));
  url.searchParams.set("$top", "1000");
  if (skip > 0) url.searchParams.set("$skip", String(skip));
  url.searchParams.set("$orderby", "SystemId");
  url.searchParams.set("$select", "SystemId,SystemName,SystemRevisionNumber");
  url.searchParams.set("$expand", "Station($select=ExecutionState,Notes;$expand=Config($select=ConfigName),Activity($select=ActivityName))");
  return url;
}

export async function fetchPoolSystems(poolNames?: string[]): Promise<PoolSystem[]> {
  const names = poolNames ?? (await getPoolSystemSettings()).poolNames;
  const records = await getAllRecords<SystemRecord>((skip) => systemsUrl(names, skip));
  return records
    .map((record) => ({
      id: typeof record.systemId === "string" ? record.systemId : "",
      name: typeof record.systemName === "string" ? record.systemName : "Unknown system",
      config: typeof record.station?.config?.configName === "string" ? record.station.config.configName : "Not available",
      executionStatus: typeof record.station?.executionState === "string" ? record.station.executionState : "Unknown",
      activity: typeof record.station?.activity?.activityName === "string" ? record.station.activity.activityName : "",
      notes: typeof record.station?.notes === "string" ? record.station.notes.trim() : "",
    }))
    .filter((system) => system.id && system.name)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export type UncoveredConfig = {
  config: string;
  domains: { domain: string; testLines: number }[];
  testLines: number;
  mappingCounts: Record<string, number>;
};

export type UncoveredConfigResult = {
  configs: UncoveredConfig[];
  mappings: ConfigCoverageMapping[];
  poolNames: string[];
  unmappedPoolNames: string[];
};

export type ConfigCoverageMappingResult = {
  mapping: ConfigCoverageMapping;
  lines: { config: string; domain: string }[];
  covered: Set<string>;
};

export function aggregateUncoveredConfigs(mappingResults: ConfigCoverageMappingResult[]): UncoveredConfig[] {
  const mappings = mappingResults.map((result) => result.mapping);
  const byConfig = new Map<string, UncoveredConfig>();
  for (const result of mappingResults) {
    for (const line of result.lines) {
      if (result.covered.has(line.config)) continue;
      const entry = byConfig.get(line.config) ?? {
        config: line.config,
        domains: [],
        testLines: 0,
        mappingCounts: Object.fromEntries(mappings.map((mapping) => [mapping.poolAlias, 0])),
      };
      entry.testLines += 1;
      entry.mappingCounts[result.mapping.poolAlias] += 1;
      const domain = entry.domains.find((candidate) => candidate.domain === line.domain);
      if (domain) domain.testLines += 1;
      else entry.domains.push({ domain: line.domain, testLines: 1 });
      byConfig.set(line.config, entry);
    }
  }
  for (const entry of byConfig.values()) entry.domains.sort((left, right) => right.testLines - left.testLines);
  return [...byConfig.values()].sort((left, right) => right.testLines - left.testLines || left.config.localeCompare(right.config));
}

type ConfigRef = { configName?: unknown } | null | undefined;

// "...DMR-PD013-611_PM_FSP" and "...DMR-PD013-611" are treated as the same config.
function baseConfig(name: string) {
  const match = name.match(/^(.*-PD\d+-\d+)_.+$/i);
  return match ? match[1] : name;
}

const configNameOf = (ref: ConfigRef) => (typeof ref?.configName === "string" ? ref.configName : "");

function entityUrl(entity: string) {
  const url = new URL(config.ngaiApiUrl);
  url.pathname = url.pathname.replace(/\/TestRunComposite\/?$/, `/${entity}`);
  return url;
}

async function getAllRecords<T>(buildUrl: (skip: number) => URL): Promise<T[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  const apiToken = await getNgaiApiToken();
  if (apiToken) headers["X-NGA-PAT"] = apiToken;
  if (config.ngaiCookie) headers.cookie = config.ngaiCookie;

  const pageSize = 1000;
  const records: T[] = [];
  for (let page = 0; page < 20; page += 1) {
    const response = await undiciRequest(buildUrl(page * pageSize), {
      method: "GET",
      headers,
      dispatcher: resolveDispatcher(),
      headersTimeout: config.ngaiTimeoutMs,
      bodyTimeout: config.ngaiTimeoutMs,
    });
    const body = await response.body.text();
    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new Error("Intel NGAi rejected the config coverage request. Check the configured NGAi token or cookie.");
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Intel NGAi config coverage request failed (${response.statusCode}).`);
    }
    const payload = JSON.parse(body) as { value?: T[] } | T[];
    const batch = Array.isArray(payload) ? payload : payload.value ?? [];
    records.push(...batch);
    if (batch.length < pageSize) break;
  }
  return records;
}

async function fetchSuiteConfigs(suiteName: string) {
  const records = await getAllRecords<{ config?: ConfigRef; validationGroup?: { testGroupName?: unknown } | null }>((skip) => {
    const url = entityUrl("TestLine");
    url.searchParams.set("$filter", `TestSuite/TestSuiteName eq '${suiteName.replace(/'/g, "''")}'`);
    url.searchParams.set("$top", "1000");
    if (skip > 0) url.searchParams.set("$skip", String(skip));
    url.searchParams.set("$select", "TestLineId");
    url.searchParams.set("$expand", "Config($select=ConfigName),ValidationGroup($select=TestGroupName)");
    return url;
  });
  return records
    .map((record) => ({
      config: baseConfig(configNameOf(record.config)),
      domain: typeof record.validationGroup?.testGroupName === "string" ? record.validationGroup.testGroupName : "Unknown",
    }))
    .filter((line) => line.config);
}

// Stations count as covering both their primary config and current-revision secondary configs.
async function fetchPoolCoveredConfigs(poolNames: string[]) {
  type StationRecord = {
    stationRevisionNumber?: number;
    config?: ConfigRef;
    stationRevisionSecondaryConfig?: { stationRevisionNumber?: number; config?: ConfigRef }[];
  };
  const stations = await getAllRecords<StationRecord>((skip) => {
    const url = entityUrl("Station");
    url.searchParams.set("$filter", poolMembershipFilter(poolNames, "LatestStationPool"));
    url.searchParams.set("$top", "1000");
    if (skip > 0) url.searchParams.set("$skip", String(skip));
    url.searchParams.set("$select", "StationName,StationRevisionNumber");
    url.searchParams.set("$expand", "Config($select=ConfigName),StationRevisionSecondaryConfig($expand=Config($select=ConfigName))");
    return url;
  });
  const covered = new Set<string>();
  for (const station of stations) {
    const primary = configNameOf(station.config);
    if (primary) covered.add(baseConfig(primary));
    for (const secondary of station.stationRevisionSecondaryConfig ?? []) {
      if (secondary.stationRevisionNumber !== station.stationRevisionNumber) continue;
      const name = configNameOf(secondary.config);
      if (name) covered.add(baseConfig(name));
    }
  }
  return covered;
}

export async function fetchUncoveredConfigs(selectedPoolNames: string[] = []): Promise<UncoveredConfigResult> {
  const [{ poolNames: configuredPoolNames }, { mappings }] = await Promise.all([getPoolSystemSettings(), getConfigCoverageSettings()]);
  const requestedPoolKeys = new Set(selectedPoolNames.map((name) => name.toLowerCase()));
  const poolNames = selectedPoolNames.length
    ? configuredPoolNames.filter((name) => requestedPoolKeys.has(name.toLowerCase()))
    : [];
  const activeMappings = mappings.filter((mapping) => poolNames.some((name) => name.toLowerCase() === mapping.poolName.toLowerCase()));
  const mappedPoolKeys = new Set(activeMappings.map((mapping) => mapping.poolName.toLowerCase()));
  const unmappedPoolNames = poolNames.filter((name) => !mappedPoolKeys.has(name.toLowerCase()));
  const mappingResults = await Promise.all(activeMappings.map(async (mapping) => {
    const [lines, covered] = await Promise.all([
      fetchSuiteConfigs(mapping.suiteName),
      fetchPoolCoveredConfigs([mapping.poolName]),
    ]);
    return { mapping, lines, covered };
  }));
  return {
    configs: aggregateUncoveredConfigs(mappingResults),
    mappings: activeMappings,
    poolNames,
    unmappedPoolNames,
  };
}
