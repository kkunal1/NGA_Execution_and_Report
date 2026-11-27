import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { normalizeSuiteNames } from "./normalize";
import type { ExecutionProfile } from "./execution-suites";

export type RefreshSettings = { intervalSeconds: number; intervalByCycle: Record<string, number>; suitesByProfile: Record<ExecutionProfile, string[]>; autoRefreshByCycle: Record<string, boolean> };
type StoredRefreshSettings = { intervalSeconds?: unknown; intervalByCycle?: unknown; suitesByProfile?: unknown; autoRefreshByCycle?: unknown };

const settingsPath = path.join(config.dataDir, "refresh-settings.json");
const statusPath = path.join(config.dataDir, "refresh-status.json");
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;
const EMPTY_SUITES_BY_PROFILE: Record<ExecutionProfile, string[]> = { b0: [], b2: [] };

function suitesForProfile(value: unknown, profile: ExecutionProfile) {
  if (!Array.isArray(value)) return [];
  return normalizeSuiteNames(value.filter((suite): suite is string => typeof suite === "string"))
    .filter((suite) => new RegExp(`_B${profile.slice(1)}_`, "i").test(suite));
}

export function normalizeAutoRefreshByCycle(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([id, enabled]) =>
    (id === "b0" || id === "b2" || /^[a-f0-9]{32}$/i.test(id)) && typeof enabled === "boolean",
  )) as Record<string, boolean>;
}

export function normalizeRefreshIntervals(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([id, interval]) =>
    (id === "b0" || id === "b2" || /^[a-f0-9]{32}$/i.test(id)) && validateRefreshInterval(interval) != null,
  ).map(([id, interval]) => [id, interval as number]));
}

export function validateRefreshIntervals(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([id, interval]) =>
    !(id === "b0" || id === "b2" || /^[a-f0-9]{32}$/i.test(id)) ||
    validateRefreshInterval(interval) == null,
  )) return null;
  return Object.fromEntries(entries) as Record<string, number>;
}

export function isCycleAutoRefreshEnabled(settings: Pick<RefreshSettings, "autoRefreshByCycle">, cycleId: string): boolean {
  return settings.autoRefreshByCycle[cycleId] !== false;
}

export function getAutoRefreshSuites(settings: RefreshSettings): string[] {
  return normalizeSuiteNames((Object.keys(settings.suitesByProfile) as ExecutionProfile[])
    .filter((profile) => isCycleAutoRefreshEnabled(settings, profile))
    .flatMap((profile) => settings.suitesByProfile[profile]));
}

export function getCycleRefreshSchedule(settings: RefreshSettings, status: RefreshStatus, cycleId: string): { intervalSeconds: number; nextRefreshAt: number | null } {
  const intervalSeconds = settings.intervalByCycle[cycleId] ?? settings.intervalSeconds;
  const enabled = settings.intervalSeconds > 0 && intervalSeconds > 0 && isCycleAutoRefreshEnabled(settings, cycleId);
  return {
    intervalSeconds: enabled ? intervalSeconds : 0,
    nextRefreshAt: enabled ? status.nextRefreshAtByCycle[cycleId] ?? status.nextRefreshAt : null,
  };
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

export type RefreshStatus = { nextRefreshAt: number | null; nextRefreshAtByCycle: Record<string, number | null> };

export function validateRefreshInterval(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value === 0) return 0;
  return value >= 15 && value <= 86_400 ? value : null;
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
      intervalByCycle: normalizeRefreshIntervals(saved.intervalByCycle),
      suitesByProfile: {
        b0: suitesForProfile(suitesByProfile.b0, "b0"),
        b2: suitesForProfile(suitesByProfile.b2, "b2"),
      },
      autoRefreshByCycle: normalizeAutoRefreshByCycle(saved.autoRefreshByCycle),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { intervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS, intervalByCycle: {}, suitesByProfile: { ...EMPTY_SUITES_BY_PROFILE }, autoRefreshByCycle: {} };
  }
}

export async function saveRefreshSettings(settings: Pick<RefreshSettings, "intervalSeconds"> & { intervalByCycle?: unknown; autoRefreshByCycle?: unknown }): Promise<void> {
  const current = await getRefreshSettings();
  const next = {
    ...current,
    intervalSeconds: settings.intervalSeconds,
    ...(settings.intervalByCycle === undefined ? {} : { intervalByCycle: normalizeRefreshIntervals(settings.intervalByCycle) }),
    ...(settings.autoRefreshByCycle === undefined ? {} : { autoRefreshByCycle: normalizeAutoRefreshByCycle(settings.autoRefreshByCycle) }),
  };
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  const previousStatus = await getRefreshStatus();
  const nextRefreshAtByCycle = { ...previousStatus.nextRefreshAtByCycle };
  const cycleIds = new Set(["b0", "b2", ...Object.keys(current.intervalByCycle), ...Object.keys(next.intervalByCycle), ...Object.keys(current.autoRefreshByCycle), ...Object.keys(next.autoRefreshByCycle)]);
  const now = Date.now();
  for (const cycleId of cycleIds) {
    const previousInterval = current.intervalByCycle[cycleId] ?? current.intervalSeconds;
    const nextInterval = next.intervalByCycle[cycleId] ?? next.intervalSeconds;
    const previousEnabled = current.intervalSeconds > 0 && previousInterval > 0 && isCycleAutoRefreshEnabled(current, cycleId);
    const nextEnabled = next.intervalSeconds > 0 && nextInterval > 0 && isCycleAutoRefreshEnabled(next, cycleId);
    if (!nextEnabled) {
      nextRefreshAtByCycle[cycleId] = null;
    } else if (previousInterval !== nextInterval || previousEnabled !== nextEnabled || nextRefreshAtByCycle[cycleId] === undefined) {
      nextRefreshAtByCycle[cycleId] = now + nextInterval * 1000;
    }
  }
  const nextRefreshAt = next.intervalSeconds > 0 ? now + next.intervalSeconds * 1000 : null;
  await writeFile(statusPath, JSON.stringify({ nextRefreshAt, nextRefreshAtByCycle }), { encoding: "utf8", mode: 0o600 });
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
    const saved = JSON.parse(await readFile(statusPath, "utf8")) as { nextRefreshAt?: unknown; nextRefreshAtByCycle?: unknown };
    const nextRefreshAtByCycle = saved.nextRefreshAtByCycle && typeof saved.nextRefreshAtByCycle === "object" && !Array.isArray(saved.nextRefreshAtByCycle)
      ? Object.fromEntries(Object.entries(saved.nextRefreshAtByCycle as Record<string, unknown>).filter(([id, value]) => (id === "b0" || id === "b2" || /^[a-f0-9]{32}$/i.test(id)) && (value === null || typeof value === "number"))) as Record<string, number | null>
      : {};
    return { nextRefreshAt: typeof saved.nextRefreshAt === "number" ? saved.nextRefreshAt : null, nextRefreshAtByCycle };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { nextRefreshAt: null, nextRefreshAtByCycle: {} };
  }
}

export async function markRefreshCycleCompleted(settings: RefreshSettings, cycleId: string, now = Date.now()): Promise<RefreshStatus> {
  const status = await getRefreshStatus();
  if (!Object.prototype.hasOwnProperty.call(settings.intervalByCycle, cycleId)) {
    return markRefreshCompleted(settings.intervalSeconds);
  }
  const cycleSchedule = getCycleRefreshSchedule(settings, status, cycleId);
  const nextRefreshAtByCycle = {
    ...status.nextRefreshAtByCycle,
    [cycleId]: cycleSchedule.intervalSeconds > 0 ? now + cycleSchedule.intervalSeconds * 1000 : null,
  };
  const nextRefreshAt = status.nextRefreshAt;
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(statusPath, JSON.stringify({ nextRefreshAt, nextRefreshAtByCycle }), { encoding: "utf8", mode: 0o600 });
  return { nextRefreshAt, nextRefreshAtByCycle };
}

export async function markRefreshCompleted(intervalSeconds: number): Promise<RefreshStatus> {
  const nextRefreshAt = intervalSeconds > 0 ? Date.now() + intervalSeconds * 1000 : null;
  await mkdir(config.dataDir, { recursive: true });
  const nextRefreshAtByCycle = intervalSeconds > 0 ? (await getRefreshStatus()).nextRefreshAtByCycle : {};
  await writeFile(statusPath, JSON.stringify({ nextRefreshAt, nextRefreshAtByCycle }), { encoding: "utf8", mode: 0o600 });
  return { nextRefreshAt, nextRefreshAtByCycle };
}
