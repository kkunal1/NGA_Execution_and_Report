import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import {
  DEFAULT_TEAM_PLATFORM_COUNTS,
  DEFAULT_WEEKLY_REPORT_BKC,
  DEFAULT_WEEKLY_REPORT_CONTENT,
  DEFAULT_WEEKLY_REPORT_HSDES_LINK,
  type TeamPlatformCount,
  type WeeklyReportContent,
  type WeeklyReportLink,
} from "./weekly-report-defaults";

export {
  DEFAULT_TEAM_PLATFORM_COUNTS,
  DEFAULT_WEEKLY_REPORT_BKC,
  DEFAULT_WEEKLY_REPORT_CONTENT,
  DEFAULT_WEEKLY_REPORT_HSDES_LINK,
  type TeamPlatformCount,
  type WeeklyReportContent,
  type WeeklyReportLink,
} from "./weekly-report-defaults";

export type WeeklyReportSettings = {
  bkc: string;
  teamPlatformCounts: TeamPlatformCount[];
  hsdesLink: string;
  links: WeeklyReportLink[];
  executionSummaryTitle: string;
  failureProgressNote: string;
  reportReviewNote: string;
};

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

function normalizeReportText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

export async function getWeeklyReportSettings(): Promise<WeeklyReportSettings> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as Partial<Record<keyof WeeklyReportSettings, unknown>>;
    return {
      bkc: normalizeWeeklyReportBkc(saved.bkc) ?? DEFAULT_WEEKLY_REPORT_BKC,
      teamPlatformCounts: normalizeTeamPlatformCounts(saved.teamPlatformCounts) ?? DEFAULT_TEAM_PLATFORM_COUNTS.map((row) => ({ ...row })),
      hsdesLink: normalizeWeeklyReportHsdesLink(saved.hsdesLink) ?? DEFAULT_WEEKLY_REPORT_HSDES_LINK,
      links: normalizeWeeklyReportLinks(saved.links) ?? DEFAULT_WEEKLY_REPORT_CONTENT.links.map((link) => ({ ...link })),
      executionSummaryTitle: normalizeReportText(saved.executionSummaryTitle, 120) ?? DEFAULT_WEEKLY_REPORT_CONTENT.executionSummaryTitle,
      failureProgressNote: normalizeReportText(saved.failureProgressNote, 300) ?? DEFAULT_WEEKLY_REPORT_CONTENT.failureProgressNote,
      reportReviewNote: normalizeReportText(saved.reportReviewNote, 300) ?? DEFAULT_WEEKLY_REPORT_CONTENT.reportReviewNote,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      bkc: DEFAULT_WEEKLY_REPORT_BKC,
      teamPlatformCounts: DEFAULT_TEAM_PLATFORM_COUNTS.map((row) => ({ ...row })),
      hsdesLink: DEFAULT_WEEKLY_REPORT_HSDES_LINK,
      ...DEFAULT_WEEKLY_REPORT_CONTENT,
    };
  }
}

export async function saveWeeklyReportSettings(values: Partial<Record<keyof WeeklyReportSettings, unknown>>): Promise<WeeklyReportSettings> {
  const bkc = normalizeWeeklyReportBkc(values.bkc);
  const teamPlatformCounts = normalizeTeamPlatformCounts(values.teamPlatformCounts);
  const hsdesLink = normalizeWeeklyReportHsdesLink(values.hsdesLink);
  const links = normalizeWeeklyReportLinks(values.links);
  const executionSummaryTitle = normalizeReportText(values.executionSummaryTitle, 120);
  const failureProgressNote = normalizeReportText(values.failureProgressNote, 300);
  const reportReviewNote = normalizeReportText(values.reportReviewNote, 300);
  if (!bkc) throw new TypeError("Enter a BKC value such as BKC#40 or BKC#WW41.");
  if (!teamPlatformCounts) throw new TypeError("Enter one to 20 unique teams with whole-number X1 and X4 counts from 0 to 1,000,000.");
  if (!hsdesLink) throw new TypeError("Enter an HSDES General Apps link containing a numeric queryId.");
  if (!links || !executionSummaryTitle || !failureProgressNote || !reportReviewNote) throw new TypeError("Check the report links and text fields; links must use HTTPS, and text must be within its length limit.");
  await mkdir(config.dataDir, { recursive: true });
  const settings = { bkc, teamPlatformCounts, hsdesLink, links, executionSummaryTitle, failureProgressNote, reportReviewNote };
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 });
  return settings;
}