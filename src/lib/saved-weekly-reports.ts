import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import type { WeeklyReport } from "./weekly-report";
import { buildFailureProgress, getB2FailureProgressWindow } from "./weekly-report-metrics";
import { getISTDateKey } from "./work-weeks";

const reportsPath = path.join(config.dataDir, "weekly-reports");

export function isWorkWeekKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-WW(?:0[1-9]|[1-4]\d|5[0-3])$/.test(value);
}

export function isDailyReportDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isSavedReportKey(value: unknown): value is string {
  return isWorkWeekKey(value) || isDailyReportDate(value);
}

export async function listSavedReportKeys(): Promise<string[]> {
  try {
    const files = await readdir(reportsPath);
    return files.filter((file) => file.endsWith(".json") && isSavedReportKey(file.slice(0, -5)))
      .map((file) => file.slice(0, -5))
      .sort((left, right) => {
        const leftDaily = isDailyReportDate(left);
        const rightDaily = isDailyReportDate(right);
        if (leftDaily !== rightDaily) return leftDaily ? -1 : 1;
        return right.localeCompare(left);
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function listSavedWeeklyReports(): Promise<string[]> {
  return (await listSavedReportKeys()).filter(isWorkWeekKey);
}

export async function loadSavedWeeklyReport(key: string): Promise<WeeklyReport | null> {
  if (!isSavedReportKey(key)) throw new TypeError("Select a valid saved report.");
  try {
    return JSON.parse(await readFile(path.join(reportsPath, `${key}.json`), "utf8")) as WeeklyReport;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveWeeklyReport(key: string, report: WeeklyReport): Promise<void> {
  if (!isWorkWeekKey(key)) throw new TypeError("Select a valid work week.");
  await writeReport(key, report);
}

export async function saveDailyReport(dateKey: string, report: WeeklyReport): Promise<void> {
  if (!isDailyReportDate(dateKey)) throw new TypeError("Select a valid report date.");
  await writeReport(dateKey, report);
}

async function writeReport(key: string, report: WeeklyReport) {
  await mkdir(reportsPath, { recursive: true });
  const temporaryPath = path.join(reportsPath, `${key}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, JSON.stringify(report, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, path.join(reportsPath, `${key}.json`));
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function withFailureProgress(
  report: WeeklyReport,
  loadDailyReport: (key: string) => Promise<WeeklyReport | null> = loadSavedWeeklyReport,
): Promise<WeeklyReport> {
  const reportDate = getISTDateKey(new Date(Date.parse(report.to) - 1));
  const isB2Report = report.suites.some((suite) => /_B2_(?:P[12]_)?Tests_Cycle$/i.test(suite));
  let window: ReturnType<typeof getB2FailureProgressWindow> | undefined;
  if (isB2Report) {
    const suiteKey = (suites: string[]) => [...new Set(suites.map((suite) => suite.trim().toLowerCase()))].sort().join("\n");
    const previousDailyKeys = (await listSavedReportKeys())
      .filter((key) => isDailyReportDate(key) && key < reportDate)
      .sort((left, right) => right.localeCompare(left));
    let startDate = reportDate;
    for (const key of previousDailyKeys) {
      const previous = await loadDailyReport(key);
      if (!previous || suiteKey(previous.suites) !== suiteKey(report.suites)) continue;
      startDate = previous.failureProgress?.days[0]?.date ?? key;
      break;
    }
    window = getB2FailureProgressWindow(startDate, reportDate);
  }
  const days = buildFailureProgress(report, [], window).days;
  const history = await Promise.all(days.filter((day) => day.date < reportDate).map(async (day) => ({
    date: day.date,
    report: await loadDailyReport(day.date),
  })));
  return {
    ...report,
    failureProgress: buildFailureProgress(report, history.flatMap((snapshot) => snapshot.report ? [{ date: snapshot.date, report: snapshot.report }] : []), window),
  };
}