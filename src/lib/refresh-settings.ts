import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { normalizeSuiteNames } from "./normalize";
import type { ExecutionProfile } from "./execution-suites";

export type RefreshSettings = { intervalSeconds: number; suitesByProfile: Record<ExecutionProfile, string[]> };
type StoredRefreshSettings = { intervalSeconds?: unknown; suitesByProfile?: unknown };

const settingsPath = path.join(config.dataDir, "refresh-settings.json");
const statusPath = path.join(config.dataDir, "refresh-status.json");
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;
const EMPTY_SUITES_BY_PROFILE: Record<ExecutionProfile, string[]> = { b0: [], b2: [] };

function suitesForProfile(value: unknown, profile: ExecutionProfile) {
  if (!Array.isArray(value)) return [];
  return normalizeSuiteNames(value.filter((suite): suite is string => typeof suite === "string"))
    .filter((suite) => new RegExp(`_B${profile.slice(1)}_`, "i").test(suite));
}

export function mergeRefreshSuites(
  current: Record<ExecutionProfile, string[]>,
  incoming: string[],
): Record<ExecutionProfile, string[]> {
  const normalized = normalizeSuiteNames(incoming);
  const next = { b0: [...current.b0], b2: [...current.b2] };
  for (const profile of ["b0", "b2"] as const) {
    const profileSuites = normalized.filter((suite) => new RegExp(`_B${profile.slice(1)}_`, "i").test(suite));
    if (profileSuites.length) next[profile] = profileSuites;
  }
  return next;
}

export type RefreshStatus = { nextRefreshAt: number | null };

export function validateRefreshInterval(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value === 0) return 0;
  return value >= 15 && value <= 3600 ? value : null;
}

export async function getRefreshSettings(): Promise<RefreshSettings> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as StoredRefreshSettings;
    const intervalSeconds = validateRefreshInterval(saved.intervalSeconds);
    const suitesByProfile = saved.suitesByProfile && typeof saved.suitesByProfile === "object"
      ? saved.suitesByProfile as Record<string, unknown>
      : {};
    return {
      intervalSeconds: intervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS,
      suitesByProfile: {
        b0: suitesForProfile(suitesByProfile.b0, "b0"),
        b2: suitesForProfile(suitesByProfile.b2, "b2"),
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { intervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS, suitesByProfile: { ...EMPTY_SUITES_BY_PROFILE } };
  }
}

export async function saveRefreshSettings(settings: Pick<RefreshSettings, "intervalSeconds">): Promise<void> {
  const current = await getRefreshSettings();
  const next = { ...current, intervalSeconds: settings.intervalSeconds };
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  const nextRefreshAt = next.intervalSeconds > 0 ? Date.now() + next.intervalSeconds * 1000 : null;
  await writeFile(statusPath, JSON.stringify({ nextRefreshAt }), { encoding: "utf8", mode: 0o600 });
}

export async function saveRefreshSuites(suiteNames: string[]): Promise<void> {
  const current = await getRefreshSettings();
  const next = {
    ...current,
    suitesByProfile: mergeRefreshSuites(current.suitesByProfile, suiteNames),
  };
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function getRefreshStatus(): Promise<RefreshStatus> {
  try {
    const saved = JSON.parse(await readFile(statusPath, "utf8")) as { nextRefreshAt?: unknown };
    return { nextRefreshAt: typeof saved.nextRefreshAt === "number" ? saved.nextRefreshAt : null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { nextRefreshAt: null };
  }
}

export async function markRefreshCompleted(intervalSeconds: number): Promise<RefreshStatus> {
  const nextRefreshAt = intervalSeconds > 0 ? Date.now() + intervalSeconds * 1000 : null;
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(statusPath, JSON.stringify({ nextRefreshAt }), { encoding: "utf8", mode: 0o600 });
  return { nextRefreshAt };
}
