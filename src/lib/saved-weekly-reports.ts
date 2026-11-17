import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import type { WeeklyReport } from "./weekly-report";
import { buildFailureProgress, getB2FailureProgressWindow } from "./weekly-report-metrics";
import { getISTDateKey } from "./work-weeks";
import { mergeWeeklyReportHsdDetails, type WeeklyReportHsdDetails } from "./weekly-report-hsd-details";

const reportsPath = path.join(config.dataDir, "weekly-reports");
const reportWrites = new Map<string, Promise<unknown>>();

function serializeReportWrite<Result>(key: string, write: () => Promise<Result>): Promise<Result> {
  const previous = reportWrites.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(write);
  reportWrites.set(key, result);
  const cleanup = () => { if (reportWrites.get(key) === result) reportWrites.delete(key); };
  void result.then(cleanup, cleanup);
  return result;
}

export function isWorkWeekKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-WW(?:0[1-9]|[1-4]\d|5[0-3])$/.test(value);
}

export function isDailyReportDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isSavedReportKey(value: unknown): value is string {
  if (isWorkWeekKey(value) || isDailyReportDate(value)) return true;
  return parseCycleReportKey(value) !== null;
}

export type CycleReportKey = { periodKey: string; cycleId: string };

export function parseCycleReportKey(value: unknown): CycleReportKey | null {
  if (typeof value !== "string") return null;
  const match = /^(.+)--(b0|b2|[a-f0-9]{32})$/.exec(value);
  if (!match || (!isDailyReportDate(match[1]) && !isWorkWeekKey(match[1]))) return null;
  return { periodKey: match[1], cycleId: match[2] };
}

export function makeCycleReportKey(periodKey: string, cycleId: string) {
  if ((!isDailyReportDate(periodKey) && !isWorkWeekKey(periodKey)) || !/^(?:b0|b2|[a-f0-9]{32})$/.test(cycleId)) {
    throw new TypeError("Select a valid report period and execution cycle.");
  }
  return `${periodKey}--${cycleId}`;
}

export async function listSavedReportKeys(): Promise<string[]> {
  try {
    const files = await readdir(reportsPath);
    return files.filter((file) => file.endsWith(".json") && isSavedReportKey(file.slice(0, -5)))
      .map((file) => file.slice(0, -5))
      .sort((left, right) => {
        const leftKey = parseCycleReportKey(left)?.periodKey ?? left;
        const rightKey = parseCycleReportKey(right)?.periodKey ?? right;
        const leftDaily = isDailyReportDate(leftKey);
        const rightDaily = isDailyReportDate(rightKey);
        if (leftDaily !== rightDaily) return leftDaily ? -1 : 1;
        return rightKey.localeCompare(leftKey) || right.localeCompare(left);
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
  const periodKey = parseCycleReportKey(key)?.periodKey ?? key;
  if (!isWorkWeekKey(periodKey)) throw new TypeError("Select a valid work week.");
  await serializeReportWrite(key, () => writeReport(key, report));
}

export async function saveDailyReport(dateKey: string, report: WeeklyReport): Promise<void> {
  const periodKey = parseCycleReportKey(dateKey)?.periodKey ?? dateKey;
  if (!isDailyReportDate(periodKey)) throw new TypeError("Select a valid report date.");
  await serializeReportWrite(dateKey, () => writeReport(dateKey, report));
}

export async function saveWeeklyReportHsdDetails(key: string, generatedAt: string, details: WeeklyReportHsdDetails): Promise<void> {
  if (!isSavedReportKey(key)) throw new TypeError("Select a valid saved report.");
  await serializeReportWrite(key, async () => {
    const saved = await loadSavedWeeklyReport(key);
    if (!saved || saved.generatedAt !== generatedAt) return;
    await writeReport(key, mergeWeeklyReportHsdDetails(saved, details));
  });
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
  const reportCycleId = report.executionCycleId ?? (report.suites.some((suite) => /_B2_(?:P[12]_)?Tests_Cycle$/i.test(suite)) ? "b2" : null);
  const isB2Report = report.suites.some((suite) => /_B2_(?:P[12]_)?Tests_Cycle$/i.test(suite));
  let window: ReturnType<typeof getB2FailureProgressWindow> | undefined;
  if (isB2Report) {
    const suiteKey = (suites: string[]) => [...new Set(suites.map((suite) => suite.trim().toLowerCase()))].sort().join("\n");
    const previousDailyKeys = (await listSavedReportKeys())
      .filter((key) => {
        const parsed = parseCycleReportKey(key);
        const periodKey = parsed?.periodKey ?? key;
        return isDailyReportDate(periodKey) && periodKey < reportDate &&
          (parsed?.cycleId === reportCycleId || (!parsed && reportCycleId === "b2"));
      })
      .sort((left, right) => (parseCycleReportKey(right)?.periodKey ?? right).localeCompare(parseCycleReportKey(left)?.periodKey ?? left));
    let startDate = reportDate;
    for (const key of previousDailyKeys) {
      const previous = await loadDailyReport(key);
      if (!previous || suiteKey(previous.suites) !== suiteKey(report.suites)) continue;
      startDate = previous.failureProgress?.days[0]?.date ?? parseCycleReportKey(key)?.periodKey ?? key;
      break;
    }
    window = getB2FailureProgressWindow(startDate, reportDate);
  }
  const days = buildFailureProgress(report, [], window).days;
  const history = await Promise.all(days.filter((day) => day.date < reportDate).map(async (day) => ({
    date: day.date,
    report: await loadDailyReport(reportCycleId ? makeCycleReportKey(day.date, reportCycleId) : day.date) ??
      (reportCycleId === "b2" ? await loadDailyReport(day.date) : null),
  })));
  return {
    ...report,
    failureProgress: buildFailureProgress(report, history.flatMap((snapshot) => snapshot.report ? [{ date: snapshot.date, report: snapshot.report }] : []), window),
  };
}