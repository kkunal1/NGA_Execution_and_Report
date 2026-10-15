import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export const DEFAULT_WEEKLY_REPORT_BKC = "BKC#40";
export const DEFAULT_WEEKLY_REPORT_HSDES_LINK = "https://hsdes.intel.com/appstore/generalapps/#/pages/community/15010407190?queryId=16032003391&articleId=16031656538";
export const DEFAULT_CPU_BREAKDOWN_TITLE = "DMR X1 and X4 CPU breakdown";
export type TeamPlatformCount = { team: string; x1: number; x4: number; extraCounts?: number[] };
export type WeeklyReportLink = { label: string; url: string };
export type WeeklyReportSettings = { bkc: string; teamPlatformCounts: TeamPlatformCount[]; cpuColumns: string[]; cpuBreakdownTitle: string; hsdesLink: string; links: WeeklyReportLink[] };
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

export function normalizeWeeklyReportBkc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bkc = value.trim();
  return /^BKC#(?:\d+|WW\d+)$/i.test(bkc) ? bkc : null;
}

export function normalizeCpuBreakdownTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title && title.length <= 120 && !/[\r\n]/.test(title) ? title : null;
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
  const seen = new Set(["team", "x1", "x4", "total"]);
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

export async function getWeeklyReportSettings(): Promise<WeeklyReportSettings> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as Partial<WeeklyReportSettings>;
    const cpuColumns = normalizeCpuColumns(saved.cpuColumns ?? []) ?? [];
    return {
      bkc: normalizeWeeklyReportBkc(saved.bkc) ?? DEFAULT_WEEKLY_REPORT_BKC,
      teamPlatformCounts: normalizeTeamPlatformCounts(saved.teamPlatformCounts, cpuColumns) ?? DEFAULT_TEAM_PLATFORM_COUNTS.map((row) => cpuColumns.length ? { ...row, extraCounts: cpuColumns.map(() => 0) } : { ...row }),
      cpuColumns,
      cpuBreakdownTitle: normalizeCpuBreakdownTitle(saved.cpuBreakdownTitle) ?? DEFAULT_CPU_BREAKDOWN_TITLE,
      hsdesLink: normalizeWeeklyReportHsdesLink(saved.hsdesLink) ?? DEFAULT_WEEKLY_REPORT_HSDES_LINK,
      links: normalizeWeeklyReportLinks(saved.links) ?? DEFAULT_WEEKLY_REPORT_LINKS.map((link) => ({ ...link })),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      bkc: DEFAULT_WEEKLY_REPORT_BKC,
      teamPlatformCounts: DEFAULT_TEAM_PLATFORM_COUNTS.map((row) => ({ ...row })),
      cpuColumns: [],
      cpuBreakdownTitle: DEFAULT_CPU_BREAKDOWN_TITLE,
      hsdesLink: DEFAULT_WEEKLY_REPORT_HSDES_LINK,
      links: DEFAULT_WEEKLY_REPORT_LINKS.map((link) => ({ ...link })),
    };
  }
}

export async function saveWeeklyReportSettings(bkcValue: unknown, countsValue: unknown, hsdesLinkValue: unknown, linksValue: unknown, columnsValue: unknown, titleValue: unknown): Promise<WeeklyReportSettings> {
  const bkc = normalizeWeeklyReportBkc(bkcValue);
  const cpuColumns = normalizeCpuColumns(columnsValue);
  const cpuBreakdownTitle = normalizeCpuBreakdownTitle(titleValue);
  const teamPlatformCounts = cpuColumns && normalizeTeamPlatformCounts(countsValue, cpuColumns);
  const hsdesLink = normalizeWeeklyReportHsdesLink(hsdesLinkValue);
  const links = normalizeWeeklyReportLinks(linksValue);
  if (!bkc) throw new TypeError("Enter a BKC value such as BKC#40 or BKC#WW41.");
  if (!cpuColumns) throw new TypeError("Enter up to 10 unique CPU column names (not Team, X1, X4, or Total).");
  if (!cpuBreakdownTitle) throw new TypeError("Enter a CPU breakdown title of up to 120 characters.");
  if (!teamPlatformCounts) throw new TypeError("Enter one to 20 unique teams with whole-number X1 and X4 counts from 0 to 1,000,000.");
  if (!hsdesLink) throw new TypeError("Enter an HSDES General Apps link containing a numeric queryId.");
  if (!links) throw new TypeError("Enter up to 20 report links with a label and valid HTTPS URL.");
  await mkdir(config.dataDir, { recursive: true });
  const settings = { bkc, teamPlatformCounts, cpuColumns, cpuBreakdownTitle, hsdesLink, links };
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 });
  return settings;
}