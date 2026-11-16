import { B0_SUITES, B2_SUITES, type ExecutionProfile } from "./execution-suites";
import { getExecutionMenuOrder, listCustomExecutionTabs, type CustomExecutionTab } from "./execution-tabs";
import { normalizeSuiteNames } from "./normalize";
import { getRefreshSettings } from "./refresh-settings";
import { DEFAULT_WEEKLY_REPORT_SUITES, getWeeklyReportSettings } from "./weekly-report-settings";

export type WeeklyReportCycle = { id: string; name: string; suiteNames: string[] };

function suiteMatchesProfile(suite: string, profile: ExecutionProfile) {
  return new RegExp(`_B${profile.slice(1)}_`, "i").test(suite);
}

export function buildWeeklyReportCycles(
  refreshSuites: Record<ExecutionProfile, string[]>,
  configuredSuites: string[],
  customTabs: CustomExecutionTab[],
  menuOrder: string[],
): WeeklyReportCycle[] {
  const configuredForProfile = (profile: ExecutionProfile, fallback: string[]) => {
    const fromRefresh = normalizeSuiteNames(refreshSuites[profile]);
    if (fromRefresh.length) return fromRefresh;
    const fromWeeklySettings = normalizeSuiteNames(configuredSuites).filter((suite) => suiteMatchesProfile(suite, profile));
    return fromWeeklySettings.length ? fromWeeklySettings : fallback;
  };
  const cycles: WeeklyReportCycle[] = [
    { id: "b0", name: "DMR AP1 PV B0 Execution", suiteNames: configuredForProfile("b0", DEFAULT_WEEKLY_REPORT_SUITES) },
    { id: "b2", name: "DMR AP1 PV B2 Execution", suiteNames: configuredForProfile("b2", [B2_SUITES.P1, B2_SUITES.P2]) },
    ...customTabs.filter((tab) => tab.enabled).map((tab) => ({ id: tab.id, name: tab.name, suiteNames: [...tab.suiteNames] })),
  ];
  const index = new Map(menuOrder.map((id, position) => [id, position]));
  return cycles.sort((left, right) => (index.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (index.get(right.id) ?? Number.MAX_SAFE_INTEGER));
}

export async function listWeeklyReportCycles(): Promise<WeeklyReportCycle[]> {
  const [refresh, settings, tabs, order] = await Promise.all([
    getRefreshSettings(),
    getWeeklyReportSettings(),
    listCustomExecutionTabs(),
    getExecutionMenuOrder(),
  ]);
  const cycles = buildWeeklyReportCycles(refresh.suitesByProfile, settings.suites, tabs, order);
  return Promise.all(cycles.map(async (cycle) => ({
    ...cycle,
    suiteNames: (await getWeeklyReportSettings(cycle.id)).suites,
  })));
}

export async function getWeeklyReportCycle(cycleId: string): Promise<WeeklyReportCycle | null> {
  return (await listWeeklyReportCycles()).find((cycle) => cycle.id === cycleId) ?? null;
}
