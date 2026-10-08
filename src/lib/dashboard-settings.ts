import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export type DashboardSettings = {
  executionStatusSplit: boolean;
  rawStateValues: boolean;
  poolSystems: boolean;
  weeklyReport: boolean;
  weeklyReportMode: "dateRange" | "workWeek";
  executionTime: boolean;
  ngaiTestRunData: boolean;
};

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  executionStatusSplit: true,
  rawStateValues: true,
  poolSystems: false,
  weeklyReport: false,
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
      poolSystems: saved.poolSystems ?? DEFAULT_DASHBOARD_SETTINGS.poolSystems,
      weeklyReport: saved.weeklyReport ?? DEFAULT_DASHBOARD_SETTINGS.weeklyReport,
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
