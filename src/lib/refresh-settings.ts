import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export type RefreshSettings = { intervalSeconds: number };

const settingsPath = path.join(config.dataDir, "refresh-settings.json");
const statusPath = path.join(config.dataDir, "refresh-status.json");
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;

export type RefreshStatus = { nextRefreshAt: number | null };

export function validateRefreshInterval(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value === 0) return 0;
  return value >= 15 && value <= 3600 ? value : null;
}

export async function getRefreshSettings(): Promise<RefreshSettings> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as { intervalSeconds?: unknown };
    const intervalSeconds = validateRefreshInterval(saved.intervalSeconds);
    return { intervalSeconds: intervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { intervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS };
  }
}

export async function saveRefreshSettings(settings: RefreshSettings): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 });
  const nextRefreshAt = settings.intervalSeconds > 0 ? Date.now() + settings.intervalSeconds * 1000 : null;
  await writeFile(statusPath, JSON.stringify({ nextRefreshAt }), { encoding: "utf8", mode: 0o600 });
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
