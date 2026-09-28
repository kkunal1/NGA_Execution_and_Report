import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export type RefreshSettings = { intervalSeconds: number };

const settingsPath = path.join(config.dataDir, "refresh-settings.json");
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;

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
}
