import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export const DEFAULT_POOL_NAMES = ["pv_dmr-ap-ap1-b0"];
const settingsPath = path.join(config.dataDir, "pool-system-settings.json");

export function normalizePoolNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const valueName of value) {
    if (typeof valueName !== "string") return null;
    const name = valueName.trim();
    const key = name.toLowerCase();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) || seen.has(key)) return null;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export async function getPoolSystemSettings(): Promise<{ poolNames: string[] }> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as { poolNames?: unknown };
    return { poolNames: normalizePoolNames(saved.poolNames) ?? [...DEFAULT_POOL_NAMES] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { poolNames: [...DEFAULT_POOL_NAMES] };
  }
}

export async function savePoolSystemSettings(value: unknown): Promise<{ poolNames: string[] }> {
  const poolNames = normalizePoolNames(value);
  if (!poolNames) throw new TypeError("Enter 1 to 20 unique pool names using letters, numbers, dots, underscores, or hyphens.");
  await mkdir(config.dataDir, { recursive: true });
  const settings = { poolNames };
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 });
  return settings;
}