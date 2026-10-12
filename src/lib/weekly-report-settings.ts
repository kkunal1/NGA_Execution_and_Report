import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export const DEFAULT_WEEKLY_REPORT_BKC = "BKC#40";
export const DEFAULT_WEEKLY_REPORT_HSDES_LINK = "https://hsdes.intel.com/appstore/generalapps/#/pages/community/15010407190?queryId=16032003391&articleId=16031656538";
export type TeamPlatformCount = { team: string; x1: number; x4: number };
export type WeeklyReportSettings = { bkc: string; teamPlatformCounts: TeamPlatformCount[]; hsdesLink: string };
export const DEFAULT_TEAM_PLATFORM_COUNTS: TeamPlatformCount[] = [
  { team: "PV.BKC", x1: 6, x4: 2 },
  { team: "DM", x1: 2, x4: 0 },
  { team: "DPMO", x1: 9, x4: 5 },
  { team: "Execution", x1: 39, x4: 6 },
];

const settingsPath = path.join(config.dataDir, "weekly-report-settings.json");

export function normalizeWeeklyReportBkc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bkc = value.trim();
  return /^BKC#(?:\d+|WW\d+)$/i.test(bkc) ? bkc : null;
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

export function normalizeTeamPlatformCounts(value: unknown): TeamPlatformCount[] | null {
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
    teams.add(key);
    rows.push({ team, x1: row.x1, x4: row.x4 });
  }
  return rows;
}

export async function getWeeklyReportSettings(): Promise<WeeklyReportSettings> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as { bkc?: unknown; teamPlatformCounts?: unknown; hsdesLink?: unknown };
    return {
      bkc: normalizeWeeklyReportBkc(saved.bkc) ?? DEFAULT_WEEKLY_REPORT_BKC,
      teamPlatformCounts: normalizeTeamPlatformCounts(saved.teamPlatformCounts) ?? DEFAULT_TEAM_PLATFORM_COUNTS.map((row) => ({ ...row })),
      hsdesLink: normalizeWeeklyReportHsdesLink(saved.hsdesLink) ?? DEFAULT_WEEKLY_REPORT_HSDES_LINK,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      bkc: DEFAULT_WEEKLY_REPORT_BKC,
      teamPlatformCounts: DEFAULT_TEAM_PLATFORM_COUNTS.map((row) => ({ ...row })),
      hsdesLink: DEFAULT_WEEKLY_REPORT_HSDES_LINK,
    };
  }
}

export async function saveWeeklyReportSettings(bkcValue: unknown, countsValue: unknown, hsdesLinkValue: unknown): Promise<WeeklyReportSettings> {
  const bkc = normalizeWeeklyReportBkc(bkcValue);
  const teamPlatformCounts = normalizeTeamPlatformCounts(countsValue);
  const hsdesLink = normalizeWeeklyReportHsdesLink(hsdesLinkValue);
  if (!bkc) throw new TypeError("Enter a BKC value such as BKC#40 or BKC#WW41.");
  if (!teamPlatformCounts) throw new TypeError("Enter one to 20 unique teams with whole-number X1 and X4 counts from 0 to 1,000,000.");
  if (!hsdesLink) throw new TypeError("Enter an HSDES General Apps link containing a numeric queryId.");
  await mkdir(config.dataDir, { recursive: true });
  const settings = { bkc, teamPlatformCounts, hsdesLink };
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 });
  return settings;
}