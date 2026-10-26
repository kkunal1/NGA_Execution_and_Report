import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { DEFAULT_WEEKLY_REPORT_SECTIONS, type WeeklyReportSectionSettings } from "./weekly-report-visibility";
export { DEFAULT_WEEKLY_REPORT_SECTIONS } from "./weekly-report-visibility";
export type { WeeklyReportSectionSettings } from "./weekly-report-visibility";

export type DashboardSettings = {
  executionStatusSplit: boolean;
  rawStateValues: boolean;
  showManualAborts: boolean;
  poolSystems: boolean;
  weeklyReport: boolean;
  weeklyReportUpdate: boolean;
  weeklyReportEmail: boolean;
  weeklyReportSections: WeeklyReportSectionSettings;
  weeklyReportMode: "dateRange" | "workWeek";
  executionTime: boolean;
  ngaiTestRunData: boolean;
};

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  executionStatusSplit: true,
  rawStateValues: true,
  showManualAborts: true,
  poolSystems: false,
  weeklyReport: false,
  weeklyReportUpdate: false,
  weeklyReportEmail: false,
  weeklyReportSections: DEFAULT_WEEKLY_REPORT_SECTIONS,
  weeklyReportMode: "dateRange",
  executionTime: false,
  ngaiTestRunData: false,
};

const settingsPath = path.join(config.dataDir, "dashboard-settings.json");

export async function getDashboardSettings(): Promise<DashboardSettings> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as Partial<DashboardSettings>;
    return {
      executionStatusSplit: saved.executionStatusSplit ?? DEFAULT_DASHBOARD_SETTINGS.executionStatusSplit,
      rawStateValues: saved.rawStateValues ?? DEFAULT_DASHBOARD_SETTINGS.rawStateValues,
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
      },
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
