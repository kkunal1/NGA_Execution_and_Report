import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { B0_SUITES, B2_SUITES } from "./execution-suites";
import { getCustomExecutionTab } from "./execution-tabs";
import { getRefreshSettings } from "./refresh-settings";
import { DEFAULT_CPU_ALLOCATION_TITLE, displayCpuAllocationTitle } from "./weekly-report-display";
import { DEFAULT_EXECUTION_SUMMARY_TEXT, DEFAULT_WEEKLY_REPORT_SUITES } from "./weekly-report-defaults";

export const DEFAULT_WEEKLY_REPORT_BKC = "BKC#40";
export { DEFAULT_EXECUTION_SUMMARY_TEXT, DEFAULT_WEEKLY_REPORT_SUITES } from "./weekly-report-defaults";
export const DEFAULT_WEEKLY_REPORT_HSDES_LINK = "https://hsdes.intel.com/appstore/generalapps/#/pages/community/15010407190?queryId=16032003391&articleId=16031656538";
export const DEFAULT_CPU_BREAKDOWN_TITLE = DEFAULT_CPU_ALLOCATION_TITLE;
export const DEFAULT_CPU_BASE_LABELS = { team: "Team", x1: "X1", x4: "X4" };
export type CpuBaseLabels = { team: string; x1: string; x4: string };
export type TeamPlatformCount = { team: string; x1: number; x4: number; extraCounts?: number[] };
export type WeeklyReportLink = { label: string; url: string };
export type CustomReportTable = { id: string; title: string; columns: string[]; rows: string[][]; enabled?: boolean };
export type WeeklyReportSettings = { bkc: string; suites: string[]; executionSummaryText: string; emailSubjectTemplate?: string; cpuAllocationPresent?: boolean; cpuAllocationEnabled: boolean; teamPlatformCounts: TeamPlatformCount[]; cpuColumns: string[]; cpuBaseLabels: CpuBaseLabels; cpuBreakdownTitle: string; hsdesLink: string; links: WeeklyReportLink[]; customTables: CustomReportTable[] };
type WeeklyReportCycleSettings = Pick<WeeklyReportSettings, "suites" | "executionSummaryText" | "emailSubjectTemplate" | "cpuAllocationPresent" | "cpuAllocationEnabled" | "teamPlatformCounts" | "cpuColumns" | "cpuBaseLabels" | "cpuBreakdownTitle" | "customTables">;
export const DEFAULT_TEAM_PLATFORM_COUNTS: TeamPlatformCount[] = [
  { team: "PV.BKC", x1: 6, x4: 2 },
  { team: "DM", x1: 2, x4: 0 },
  { team: "DPMO", x1: 9, x4: 5 },
  { team: "Execution", x1: 39, x4: 6 },
];
export const DEFAULT_WEEKLY_REPORT_LINKS: WeeklyReportLink[] = [
  { label: "PV VV Exec Summary Dashboard", url: "https://xve-dashboards.intel.com/dmr-ap/execution-summary" },
];

const settingsPath = path.join(config.dataDir, "weekly-report-settings.json");
const cycleSettingsPath = path.join(config.dataDir, "weekly-report-cycle-settings.json");
let settingsWriteQueue: Promise<unknown> = Promise.resolve();

function serializeSettingsWrite<Result>(write: () => Promise<Result>): Promise<Result> {
  const result = settingsWriteQueue.then(write);
  settingsWriteQueue = result.catch(() => undefined);
  return result;
}

async function writeCycleSettingsMap(settings: Record<string, unknown>) {
  const temporaryPath = `${cycleSettingsPath}.${randomUUID()}.tmp`;
  try {
    await mkdir(config.dataDir, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, cycleSettingsPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function isReportCycleId(value: string) {
  return value === "b0" || value === "b2" || /^[a-f0-9]{32}$/.test(value);
}

export function normalizeWeeklyReportBkc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bkc = value.trim();
  return /^BKC#(?:\d+|WW\d+)$/i.test(bkc) ? bkc : null;
}

export function normalizeCpuBreakdownTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title && title.length <= 120 && !/[\r\n]/.test(title) ? displayCpuAllocationTitle(title) : null;
}

export function normalizeWeeklyReportHsdesLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const link = new URL(value.trim());
    if (link.protocol !== "https:" || link.hostname !== "hsdes.intel.com" || (link.port && link.port !== "443") || link.pathname !== "/appstore/generalapps/") return null;
    const fragment = link.hash.slice(1);
    const queryString = fragment.includes("?") ? fragment.slice(fragment.indexOf("?") + 1) : "";
    return /^\d+$/.test(new URLSearchParams(queryString).get("queryId") ?? "") ? link.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeCpuColumns(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  const seen = new Set(["team", "x1", "x4"]);
  const columns: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const label = item.trim();
    const key = label.toLowerCase();
    if (!label || label.length > 40 || seen.has(key)) return null;
    seen.add(key);
    columns.push(label);
  }
  return columns;
}

export function normalizeTeamPlatformCounts(value: unknown, columns: string[] = []): TeamPlatformCount[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
  const teams = new Set<string>();
  const rows: TeamPlatformCount[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.team !== "string" || typeof row.x1 !== "number" || typeof row.x4 !== "number") return null;
    const team = row.team.trim();
    const key = team.toLowerCase();
    if (!team || team.length > 60 || teams.has(key)) return null;
    if (![row.x1, row.x4].every((count) => Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000)) return null;
    const extraCounts = row.extraCounts;
    if (columns.length && (!Array.isArray(extraCounts) || extraCounts.length !== columns.length)) return null;
    if (!columns.length && extraCounts != null && (!Array.isArray(extraCounts) || extraCounts.length !== 0)) return null;
    if (Array.isArray(extraCounts) && !extraCounts.every((count) => Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000)) return null;
    teams.add(key);
    rows.push(columns.length ? { team, x1: row.x1, x4: row.x4, extraCounts: [...extraCounts as number[]] } : { team, x1: row.x1, x4: row.x4 });
  }
  return rows;
}

export function normalizeWeeklyReportLinks(value: unknown): WeeklyReportLink[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const links: WeeklyReportLink[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.label !== "string" || typeof row.url !== "string") return null;
    const label = row.label.trim();
    const url = row.url.trim();
    if (!label || label.length > 120 || url.length > 2048) return null;
    try {
      if (new URL(url).protocol !== "https:") return null;
    } catch {
      return null;
    }
    links.push({ label, url });
  }
  return links;
}

export function normalizeCustomReportTables(value: unknown): CustomReportTable[] | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  const ids = new Set<string>();
  const tables: CustomReportTable[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(row.id) || ids.has(row.id)) return null;
    if (typeof row.title !== "string" || !row.title.trim() || row.title.trim().length > 120 || /[\r\n]/.test(row.title)) return null;
    if (!Array.isArray(row.columns) || row.columns.length < 1 || row.columns.length > 12) return null;
    const columns: string[] = [];
    const columnNames = new Set<string>();
    for (const column of row.columns) {
      if (typeof column !== "string" || !column.trim() || column.trim().length > 60 || /[\r\n]/.test(column)) return null;
      const key = column.trim().toLowerCase();
      if (columnNames.has(key)) return null;
      columnNames.add(key);
      columns.push(column.trim());
    }
    if (!Array.isArray(row.rows) || row.rows.length > 100) return null;
    const rows: string[][] = [];
    for (const cells of row.rows) {
      if (!Array.isArray(cells) || cells.length !== columns.length || cells.some((cell) => typeof cell !== "string" || cell.length > 500)) return null;
      rows.push([...cells] as string[]);
    }
    ids.add(row.id);
    if (row.enabled !== undefined && typeof row.enabled !== "boolean") return null;
    tables.push({ id: row.id, title: row.title.trim(), columns, rows, enabled: row.enabled !== false });
  }
  return tables;
}

async function readLegacyWeeklyReportSettings(): Promise<WeeklyReportSettings> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as Partial<WeeklyReportSettings>;
    const cpuColumns = normalizeCpuColumns(saved.cpuColumns ?? []) ?? [];
    const customTables = normalizeCustomReportTables(saved.customTables ?? []) ?? [];
    return {
      bkc: normalizeWeeklyReportBkc(saved.bkc) ?? DEFAULT_WEEKLY_REPORT_BKC,
      suites: normalizeWeeklyReportSuites(saved.suites) ?? [...DEFAULT_WEEKLY_REPORT_SUITES],
      executionSummaryText: normalizeExecutionSummaryText(saved.executionSummaryText) || DEFAULT_EXECUTION_SUMMARY_TEXT,
      cpuAllocationEnabled: saved.cpuAllocationEnabled ?? true,
      teamPlatformCounts: normalizeTeamPlatformCounts(saved.teamPlatformCounts, cpuColumns) ?? DEFAULT_TEAM_PLATFORM_COUNTS.map((row) => cpuColumns.length ? { ...row, extraCounts: cpuColumns.map(() => 0) } : { ...row }),
      cpuColumns,
      cpuBaseLabels: normalizeCpuBaseLabels(saved.cpuBaseLabels) ?? { ...DEFAULT_CPU_BASE_LABELS },
      cpuBreakdownTitle: normalizeCpuBreakdownTitle(saved.cpuBreakdownTitle) ?? DEFAULT_CPU_BREAKDOWN_TITLE,
      hsdesLink: normalizeWeeklyReportHsdesLink(saved.hsdesLink) ?? DEFAULT_WEEKLY_REPORT_HSDES_LINK,
      links: normalizeWeeklyReportLinks(saved.links) ?? DEFAULT_WEEKLY_REPORT_LINKS.map((link) => ({ ...link })),
      customTables,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      bkc: DEFAULT_WEEKLY_REPORT_BKC,
      suites: [...DEFAULT_WEEKLY_REPORT_SUITES],
      executionSummaryText: DEFAULT_EXECUTION_SUMMARY_TEXT,
      cpuAllocationEnabled: true,
      teamPlatformCounts: DEFAULT_TEAM_PLATFORM_COUNTS.map((row) => ({ ...row })),
      cpuColumns: [],
      cpuBaseLabels: { ...DEFAULT_CPU_BASE_LABELS },
      cpuBreakdownTitle: DEFAULT_CPU_BREAKDOWN_TITLE,
      hsdesLink: DEFAULT_WEEKLY_REPORT_HSDES_LINK,
      links: DEFAULT_WEEKLY_REPORT_LINKS.map((link) => ({ ...link })),
      customTables: [],
    };
  }
}

async function readCycleSettingsMap(): Promise<Record<string, unknown>> {
  try {
    const saved = JSON.parse(await readFile(cycleSettingsPath, "utf8")) as unknown;
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved as Record<string, unknown> : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function normalizeCycleSettings(value: unknown, fallback: WeeklyReportSettings): WeeklyReportCycleSettings {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const cpuColumns = normalizeCpuColumns(saved.cpuColumns) ?? fallback.cpuColumns;
  const cpuAllocationPresent = typeof saved.cpuAllocationPresent === "boolean"
    ? saved.cpuAllocationPresent
    : Array.isArray(saved.teamPlatformCounts) || fallback.cpuAllocationPresent !== false;
  return {
    suites: normalizeWeeklyReportSuites(saved.suites) ?? fallback.suites,
    executionSummaryText: normalizeExecutionSummaryText(saved.executionSummaryText) || fallback.executionSummaryText,
    emailSubjectTemplate: normalizeWeeklyReportEmailSubject(saved.emailSubjectTemplate) ?? fallback.emailSubjectTemplate,
    cpuAllocationPresent,
    cpuAllocationEnabled: cpuAllocationPresent && (typeof saved.cpuAllocationEnabled === "boolean" ? saved.cpuAllocationEnabled : fallback.cpuAllocationEnabled),
    teamPlatformCounts: normalizeTeamPlatformCounts(saved.teamPlatformCounts, cpuColumns) ?? fallback.teamPlatformCounts,
    cpuColumns,
    cpuBaseLabels: normalizeCpuBaseLabels(saved.cpuBaseLabels) ?? fallback.cpuBaseLabels,
    cpuBreakdownTitle: normalizeCpuBreakdownTitle(saved.cpuBreakdownTitle) ?? fallback.cpuBreakdownTitle,
    customTables: normalizeCustomReportTables(saved.customTables) ?? fallback.customTables,
  };
}

export async function getWeeklyReportSettings(cycleId = "b2"): Promise<WeeklyReportSettings> {
  if (!isReportCycleId(cycleId)) throw new TypeError("Select a valid execution cycle.");
  const [shared, refreshSettings, cycleSettings] = await Promise.all([
    readLegacyWeeklyReportSettings(),
    getRefreshSettings(),
    readCycleSettingsMap(),
  ]);
  let suiteFallback = shared.suites;
  let cycleName = cycleId === "b0" ? "DMR AP1 PV B0 Execution" : "DMR AP1 B2 Execution";
  if (cycleId === "b0") {
    suiteFallback = refreshSettings.suitesByProfile.b0.length ? refreshSettings.suitesByProfile.b0 : [B0_SUITES.P1, B0_SUITES.P2];
  } else if (cycleId === "b2") {
    const configuredB2Suites = shared.suites.filter((suite) => /_B2_/i.test(suite));
    suiteFallback = refreshSettings.suitesByProfile.b2.length
      ? refreshSettings.suitesByProfile.b2
      : configuredB2Suites.length ? configuredB2Suites : [B2_SUITES.P1, B2_SUITES.P2];
  } else {
    const tab = await getCustomExecutionTab(cycleId);
    if (!tab) throw new TypeError("Select an available execution cycle.");
    suiteFallback = tab.suiteNames;
    cycleName = tab.name;
  }
  const fallback = cycleId === "b2"
    ? { ...shared, suites: suiteFallback, cpuAllocationPresent: true, emailSubjectTemplate: `${cycleName} Daily Status Report For {{reportDay}}` }
    : { ...shared, suites: suiteFallback, cpuAllocationPresent: false, cpuAllocationEnabled: false, teamPlatformCounts: DEFAULT_TEAM_PLATFORM_COUNTS.map((row) => ({ ...row })), cpuColumns: [], cpuBaseLabels: { ...DEFAULT_CPU_BASE_LABELS }, cpuBreakdownTitle: DEFAULT_CPU_BREAKDOWN_TITLE, customTables: [], emailSubjectTemplate: `${cycleName} Daily Status Report For {{reportDay}}` };
  return { ...fallback, ...normalizeCycleSettings(cycleSettings[cycleId], fallback) };
}

export function transferWeeklyReportTable(source: WeeklyReportSettings, target: WeeklyReportSettings, tableId: string | null): { source: WeeklyReportSettings; target: WeeklyReportSettings } {
  if (tableId === null) {
    if (source.cpuAllocationPresent === false) throw new TypeError("The allocation table is no longer in this cycle.");
    if (target.cpuAllocationPresent !== false) throw new TypeError("The target cycle already has an allocation table. Move that table first, or choose another cycle.");
    return {
      source: { ...source, cpuAllocationPresent: false, cpuAllocationEnabled: false },
      target: { ...target, cpuAllocationPresent: true, cpuAllocationEnabled: source.cpuAllocationEnabled, teamPlatformCounts: source.teamPlatformCounts, cpuColumns: source.cpuColumns, cpuBaseLabels: source.cpuBaseLabels, cpuBreakdownTitle: source.cpuBreakdownTitle },
    };
  }
  const table = source.customTables.find((item) => item.id === tableId);
  if (!table) throw new TypeError("The table is no longer in this cycle. Reload and try again.");
  const matchingTable = target.customTables.find((item) =>
    item.title.trim().toLowerCase() === table.title.trim().toLowerCase()
    && JSON.stringify(item.columns) === JSON.stringify(table.columns)
    && JSON.stringify(item.rows) === JSON.stringify(table.rows)
    && (item.enabled !== false) === (table.enabled !== false));
  if (matchingTable) {
    return {
      source: { ...source, customTables: source.customTables.filter((item) => item.id !== tableId) },
      target,
    };
  }
  if (target.customTables.length >= 10) throw new TypeError("The target cycle already has 10 custom tables.");
  const movedTable = { ...table };
  if (target.customTables.some((item) => item.id === movedTable.id)) movedTable.id = randomUUID();
  let titleIndex = 1;
  while (target.customTables.some((item) => item.title.trim().toLowerCase() === movedTable.title.trim().toLowerCase())) {
    const suffix = titleIndex === 1 ? " (moved)" : ` (moved ${titleIndex})`;
    movedTable.title = `${table.title.trim().slice(0, 120 - suffix.length)}${suffix}`;
    titleIndex += 1;
  }
  return {
    source: { ...source, customTables: source.customTables.filter((item) => item.id !== tableId) },
    target: { ...target, customTables: [...target.customTables, movedTable] },
  };
}

function cycleContent(settings: WeeklyReportSettings): WeeklyReportCycleSettings {
  const { suites, executionSummaryText, emailSubjectTemplate, cpuAllocationPresent, cpuAllocationEnabled, teamPlatformCounts, cpuColumns, cpuBaseLabels, cpuBreakdownTitle, customTables } = settings;
  return { suites, executionSummaryText, emailSubjectTemplate, cpuAllocationPresent, cpuAllocationEnabled, teamPlatformCounts, cpuColumns, cpuBaseLabels, cpuBreakdownTitle, customTables };
}

export async function moveWeeklyReportTable(sourceCycleId: string, targetCycleId: string, tableId: string | null): Promise<WeeklyReportSettings> {
  if (sourceCycleId === targetCycleId) throw new TypeError("Select a different target cycle.");
  return serializeSettingsWrite(async () => {
    const [source, target] = await Promise.all([getWeeklyReportSettings(sourceCycleId), getWeeklyReportSettings(targetCycleId)]);
    const moved = transferWeeklyReportTable(source, target, tableId);
    const cycleSettings = await readCycleSettingsMap();
    cycleSettings[sourceCycleId] = cycleContent(moved.source);
    cycleSettings[targetCycleId] = cycleContent(moved.target);
    await writeCycleSettingsMap(cycleSettings);
    return moved.source;
  });
}

export async function saveWeeklyReportSettings(bkcValue: unknown, countsValue: unknown, hsdesLinkValue: unknown, linksValue: unknown, columnsValue: unknown, titleValue: unknown, baseLabelsValue: unknown = DEFAULT_CPU_BASE_LABELS, customTablesValue?: unknown, suitesValue: unknown = DEFAULT_WEEKLY_REPORT_SUITES, executionSummaryTextValue: unknown = DEFAULT_EXECUTION_SUMMARY_TEXT, cpuAllocationEnabledValue: unknown = true, cycleId = "b2", cpuAllocationPresentValue: unknown = true, emailSubjectValue?: unknown): Promise<WeeklyReportSettings> {
  if (!isReportCycleId(cycleId)) throw new TypeError("Select a valid execution cycle.");
  const bkc = normalizeWeeklyReportBkc(bkcValue);
  const suites = normalizeWeeklyReportSuites(suitesValue);
  const executionSummaryText = normalizeExecutionSummaryText(executionSummaryTextValue);
  const cpuAllocationEnabled = typeof cpuAllocationEnabledValue === "boolean" ? cpuAllocationEnabledValue : null;
  const cpuColumns = normalizeCpuColumns(columnsValue);
  const cpuBaseLabels = normalizeCpuBaseLabels(baseLabelsValue);
  const cpuBreakdownTitle = normalizeCpuBreakdownTitle(titleValue);
  const teamPlatformCounts = cpuColumns && normalizeTeamPlatformCounts(countsValue, cpuColumns);
  const hsdesLink = normalizeWeeklyReportHsdesLink(hsdesLinkValue);
  const links = normalizeWeeklyReportLinks(linksValue);
  const customTables = customTablesValue === undefined
    ? (await getWeeklyReportSettings(cycleId)).customTables
    : normalizeCustomReportTables(customTablesValue);
  const emailSubjectTemplate = emailSubjectValue === undefined ? undefined : normalizeWeeklyReportEmailSubject(emailSubjectValue);
  if (!bkc) throw new TypeError("Enter a BKC value such as BKC#40 or BKC#WW41.");
  if (!suites) throw new TypeError("Enter one to 20 unique NGAi suite names, each up to 512 characters.");
  if (executionSummaryText === null) throw new TypeError("Execution summary text must be 10,000 characters or fewer.");
  if (cpuAllocationEnabled === null) throw new TypeError("Choose whether the main allocation table is enabled.");
  if (typeof cpuAllocationPresentValue !== "boolean") throw new TypeError("Choose whether the allocation table belongs to this cycle.");
  if (!cpuColumns) throw new TypeError("Enter up to 10 unique CPU column names (not Team, X1, or X4).");
  if (!cpuBaseLabels || cpuColumns.some((column) => Object.values(cpuBaseLabels).some((label) => label.toLowerCase() === column.toLowerCase()))) {
    throw new TypeError("Enter unique Team, X1, and X4 column labels of up to 40 characters.");
  }
  if (!cpuBreakdownTitle) throw new TypeError("Enter a CPU breakdown title of up to 120 characters.");
  if (!teamPlatformCounts) throw new TypeError("Enter one to 20 unique teams with whole-number X1 and X4 counts from 0 to 1,000,000.");
  if (!hsdesLink) throw new TypeError("Enter an HSDES General Apps link containing a numeric queryId.");
  if (!links) throw new TypeError("Enter up to 20 report links with a label and valid HTTPS URL.");
  if (!customTables) throw new TypeError("Enter up to 10 custom tables with up to 12 columns and 100 rows each.");
  if (emailSubjectTemplate === null) throw new TypeError("Enter a valid email subject containing {{reportDay}} (maximum 180 characters).");
  return serializeSettingsWrite(async () => {
    await mkdir(config.dataDir, { recursive: true });
    const shared = await readLegacyWeeklyReportSettings();
    const sharedSettings = { ...shared, bkc, hsdesLink, links };
    await writeFile(settingsPath, JSON.stringify(sharedSettings, null, 2), { encoding: "utf8", mode: 0o600 });
    const cycleSettings = await readCycleSettingsMap();
    const existing = cycleSettings[cycleId];
    const existingSubject = existing && typeof existing === "object" ? normalizeWeeklyReportEmailSubject((existing as Record<string, unknown>).emailSubjectTemplate) : null;
    cycleSettings[cycleId] = { suites, executionSummaryText: executionSummaryText || DEFAULT_EXECUTION_SUMMARY_TEXT, emailSubjectTemplate: emailSubjectTemplate ?? existingSubject ?? undefined, cpuAllocationPresent: cpuAllocationPresentValue, cpuAllocationEnabled: cpuAllocationPresentValue && cpuAllocationEnabled, teamPlatformCounts, cpuColumns, cpuBaseLabels, cpuBreakdownTitle, customTables } satisfies WeeklyReportCycleSettings;
    await writeCycleSettingsMap(cycleSettings);
    return getWeeklyReportSettings(cycleId);
  });
}

export function normalizeCpuBaseLabels(value: unknown): CpuBaseLabels | null {
  if (!value || typeof value !== "object") return null;
  const labels = value as Record<string, unknown>;
  const values = [labels.team, labels.x1, labels.x4];
  if (values.some((label) => typeof label !== "string" || !label.trim() || label.trim().length > 40)) return null;
  const [team, x1, x4] = values.map((label) => (label as string).trim());
  return new Set([team.toLowerCase(), x1.toLowerCase(), x4.toLowerCase(), "total"]).size === 4 ? { team, x1, x4 } : null;
}

export function normalizeWeeklyReportSuites(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const suites: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return null;
    const suite = item.trim();
    const key = suite.toLowerCase();
    if (!suite || suite.length > 512 || /[\r\n]/.test(suite) || seen.has(key)) return null;
    seen.add(key);
    suites.push(suite);
  }
  return suites;
}

export function normalizeExecutionSummaryText(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 10_000 || value.includes("\0")) return null;
  return value.trim();
}

export function normalizeWeeklyReportEmailSubject(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const subject = value.trim();
  return subject.length <= 180 && subject.includes("{{reportDay}}") && !/[\x00-\x1f\x7f]/.test(subject) ? subject : null;
}