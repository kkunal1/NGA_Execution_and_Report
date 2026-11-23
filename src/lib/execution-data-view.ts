import type { ExecutionAttempt, ExecutionDataDomain, ExecutionDataResult, ExecutionDataTest } from "./execution-data";

export type ExecutionSystemGroup = { configName: string; systems: { key: string; name: string }[] };
export type ExecutionCategoryTest = { test: ExecutionDataTest; attempts: ExecutionAttempt[] };
export type ExecutionCategories = { nga: ExecutionCategoryTest[]; manualUnverified: ExecutionCategoryTest[]; unknown: ExecutionCategoryTest[] };

export function categorizeExecutionAttempt(attempt: ExecutionAttempt): keyof ExecutionCategories {
  if (attempt.systemId || attempt.systemName) return "nga";
  if (!attempt.stationId && !attempt.stationName) return "manualUnverified";
  return "unknown";
}

export function groupDomainExecutionCategories(domain: ExecutionDataDomain): ExecutionCategories {
  const categories: ExecutionCategories = { nga: [], manualUnverified: [], unknown: [] };
  for (const test of domain.tests) {
    const attempts: Record<keyof ExecutionCategories, ExecutionAttempt[]> = { nga: [], manualUnverified: [], unknown: [] };
    for (const attempt of test.attempts) attempts[categorizeExecutionAttempt(attempt)].push(attempt);
    for (const category of Object.keys(attempts) as (keyof ExecutionCategories)[]) {
      if (attempts[category].length) categories[category].push({ test, attempts: attempts[category] });
    }
  }
  return categories;
}

export function formatExecutionCategoryCounts(items: ExecutionCategoryTest[]): string {
  const runs = items.reduce((total, item) => total + item.attempts.length, 0);
  return `${items.length.toLocaleString()} ${items.length === 1 ? "test" : "tests"} | ${runs.toLocaleString()} ${runs === 1 ? "run" : "runs"}`;
}

export function baseExecutionConfigName(name: string): string {
  return name.match(/^(.*?-PD\d+-\d+)(?:_.*)?$/i)?.[1] ?? name;
}

export function formatExecutionDays(seconds: number): string {
  return `${(seconds / 86400).toFixed(2)} days`;
}

export function groupExecutionSystemsByConfig(result: ExecutionDataResult): ExecutionSystemGroup[] {
  const groups = new Map<string, { configName: string; systems: Map<string, string> }>();
  for (const domain of result.domains) {
    for (const test of domain.tests) {
      for (const attempt of test.attempts) {
        const id = attempt.systemId?.trim();
        const name = attempt.systemName?.trim();
        if (!id && !name) continue;
        const configName = baseExecutionConfigName(attempt.configName?.trim() || "Unknown configuration");
        const configKey = configName.toLowerCase();
        const systemKey = id ? `id:${id.toLowerCase()}` : `name:${name?.toLowerCase()}`;
        const group = groups.get(configKey) ?? { configName, systems: new Map<string, string>() };
        const previous = group.systems.get(systemKey);
        if (!previous || (previous === "Name unavailable" && name)) group.systems.set(systemKey, name || "Name unavailable");
        groups.set(configKey, group);
      }
    }
  }
  return [...groups.values()]
    .map((group) => ({ configName: group.configName, systems: [...group.systems].map(([key, name]) => ({ key, name })).sort((left, right) => left.name.localeCompare(right.name)) }))
    .sort((left, right) => left.configName === "Unknown configuration" ? 1 : right.configName === "Unknown configuration" ? -1 : left.configName.localeCompare(right.configName));
}