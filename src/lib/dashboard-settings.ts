import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { DEFAULT_WEEKLY_REPORT_SECTIONS, type WeeklyReportSectionSettings } from "./weekly-report-visibility";
export { DEFAULT_WEEKLY_REPORT_SECTIONS } from "./weekly-report-visibility";
export type { WeeklyReportSectionSettings } from "./weekly-report-visibility";

export type DashboardSettings = {
  showManualAborts: boolean;
  poolSystems: boolean;
  weeklyReport: boolean;
  weeklyReportUpdate: boolean;
  weeklyReportEmail: boolean;
  weeklyReportSections: WeeklyReportSectionSettings;
  autoDailyReportByCycle: Record<string, boolean>;
  dailyReportSkippedThroughByCycle: Record<string, string>;
  weeklyReportMode: "dateRange" | "workWeek";
  executionTime: boolean;
  ngaiTestRunData: boolean;
};

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  showManualAborts: false,
  poolSystems: false,
  weeklyReport: false,
  weeklyReportUpdate: false,
  weeklyReportEmail: false,
  weeklyReportSections: DEFAULT_WEEKLY_REPORT_SECTIONS,
  autoDailyReportByCycle: {},
  dailyReportSkippedThroughByCycle: {},
  weeklyReportMode: "dateRange",
  executionTime: false,
  ngaiTestRunData: false,
};

const settingsPath = path.join(config.dataDir, "dashboard-settings.json");

function isReportCycleId(id: string) {
  return id === "b0" || id === "b2" || /^[a-f0-9]{32}$/i.test(id);
}

export function normalizeAutoDailyReportByCycle(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([id, enabled]) => isReportCycleId(id) && typeof enabled === "boolean")) as Record<string, boolean>;
}

function normalizeDailyReportSkippedThrough(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([id, date]) => {
    if (!isReportCycleId(id) || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    return new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date;
  })) as Record<string, string>;
}

export function isAutomaticDailyReportEnabled(settings: Pick<DashboardSettings, "autoDailyReportByCycle">, cycleId: string) {
  return settings.autoDailyReportByCycle[cycleId] !== false;
}

export async function markDailyReportSkippedThrough(cycleId: string, date: string): Promise<void> {
  if (!isReportCycleId(cycleId)) return;
  const settings = await getDashboardSettings();
  const previous = settings.dailyReportSkippedThroughByCycle[cycleId];
  if (previous && previous >= date) return;
  await saveDashboardSettings({
    ...settings,
    dailyReportSkippedThroughByCycle: { ...settings.dailyReportSkippedThroughByCycle, [cycleId]: date },
  });
}

export async function getDashboardSettings(): Promise<DashboardSettings> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as Partial<DashboardSettings>;
    return {
      showManualAborts: saved.showManualAborts ?? DEFAULT_DASHBOARD_SETTINGS.showManualAborts,
      poolSystems: saved.poolSystems ?? DEFAULT_DASHBOARD_SETTINGS.poolSystems,
      weeklyReport: saved.weeklyReport ?? DEFAULT_DASHBOARD_SETTINGS.weeklyReport,
      weeklyReportUpdate: saved.weeklyReportUpdate ?? DEFAULT_DASHBOARD_SETTINGS.weeklyReportUpdate,
      weeklyReportEmail: saved.weeklyReportEmail ?? DEFAULT_DASHBOARD_SETTINGS.weeklyReportEmail,
      weeklyReportSections: {
        cpuAllocation: saved.weeklyReportSections?.cpuAllocation ?? DEFAULT_WEEKLY_REPORT_SECTIONS.cpuAllocation,
        hsdFailureSummary: saved.weeklyReportSections?.hsdFailureSummary ?? DEFAULT_WEEKLY_REPORT_SECTIONS.hsdFailureSummary,
        domainWise: saved.weeklyReportSections?.domainWise ?? DEFAULT_WEEKLY_REPORT_SECTIONS.domainWise,
        overallFailureBreakdown: saved.weeklyReportSections?.overallFailureBreakdown ?? DEFAULT_WEEKLY_REPORT_SECTIONS.overallFailureBreakdown,
        openHsdesIssues: saved.weeklyReportSections?.openHsdesIssues ?? DEFAULT_WEEKLY_REPORT_SECTIONS.openHsdesIssues,
      },
      autoDailyReportByCycle: normalizeAutoDailyReportByCycle(saved.autoDailyReportByCycle),
      dailyReportSkippedThroughByCycle: normalizeDailyReportSkippedThrough(saved.dailyReportSkippedThroughByCycle),
      weeklyReportMode: saved.weeklyReportMode === "workWeek" ? "workWeek" : "dateRange",
      executionTime: saved.executionTime ?? DEFAULT_DASHBOARD_SETTINGS.executionTime,
      ngaiTestRunData: saved.ngaiTestRunData ?? DEFAULT_DASHBOARD_SETTINGS.ngaiTestRunData,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return DEFAULT_DASHBOARD_SETTINGS;
  }
}

export async function saveDashboardSettings(settings: DashboardSettings): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 });
}
