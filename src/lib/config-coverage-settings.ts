import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { B0_SUITES } from "./execution-suites";

export type ConfigCoverageSuite = { label: string; suiteName: string };

export const DEFAULT_CONFIG_COVERAGE_SUITES: ConfigCoverageSuite[] = [
  { label: "B0 P1", suiteName: B0_SUITES.P1 },
  { label: "B0 P2", suiteName: B0_SUITES.P2 },
  { label: "B2", suiteName: "Oak_Stream_Platform_1_DMR-Platform_PC-PAIV-Platform-AP1_B2_Tests_Cycle" },
];

const settingsPath = path.join(config.dataDir, "config-coverage-suites.json");

export function normalizeConfigCoverageSuites(value: unknown): ConfigCoverageSuite[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  const suites: ConfigCoverageSuite[] = [];
  const labels = new Set<string>();
  const suiteNames = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.label !== "string" || typeof candidate.suiteName !== "string") return null;
    const label = candidate.label.trim();
    const suiteName = candidate.suiteName.trim();
    const labelKey = label.toLowerCase();
    const suiteKey = suiteName.toLowerCase();
    if (!label || label.length > 40 || /[\r\n]/.test(label) || !suiteName || suiteName.length > 512 || /[\r\n]/.test(suiteName)) return null;
    if (labels.has(labelKey) || suiteNames.has(suiteKey)) return null;
    labels.add(labelKey);
    suiteNames.add(suiteKey);
    suites.push({ label, suiteName });
  }
  return suites;
}

export async function getConfigCoverageSettings(): Promise<{ suites: ConfigCoverageSuite[] }> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as { suites?: unknown };
    return { suites: normalizeConfigCoverageSuites(saved.suites) ?? DEFAULT_CONFIG_COVERAGE_SUITES.map((suite) => ({ ...suite })) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { suites: DEFAULT_CONFIG_COVERAGE_SUITES.map((suite) => ({ ...suite })) };
  }
}

export async function saveConfigCoverageSettings(value: unknown): Promise<{ suites: ConfigCoverageSuite[] }> {
  const suites = normalizeConfigCoverageSuites(value);
  if (!suites) throw new TypeError("Enter 1 to 12 suites with unique labels and suite names.");
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify({ suites }, null, 2), { encoding: "utf8", mode: 0o600 });
  return { suites };
}