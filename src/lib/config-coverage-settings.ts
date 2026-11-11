import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { B0_SUITES } from "./execution-suites";

export type ConfigCoverageMapping = { poolName: string; poolAlias: string; suiteName: string };

export const DEFAULT_CONFIG_COVERAGE_MAPPINGS: ConfigCoverageMapping[] = [
  { poolName: "pv_dmr-ap-ap1-b0", poolAlias: "ap1_b0_testcycle", suiteName: B0_SUITES.P1 },
  { poolName: "dmr-ap-ap1-b1", poolAlias: "ap1_b1_testcycle", suiteName: B0_SUITES.P2 },
  { poolName: "pv_dmr-ap-ap1-b2", poolAlias: "ap1_b2_testcycle", suiteName: "Oak_Stream_Platform_1_DMR-Platform_PC-PAIV-Platform-AP1_B2_Tests_Cycle" },
];

const settingsPath = path.join(config.dataDir, "config-coverage-suites.json");

export function normalizeConfigCoverageMappings(value: unknown): ConfigCoverageMapping[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  const mappings: ConfigCoverageMapping[] = [];
  const aliases = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.poolName !== "string" || typeof candidate.poolAlias !== "string" || typeof candidate.suiteName !== "string") return null;
    const poolName = candidate.poolName.trim();
    const poolAlias = candidate.poolAlias.trim();
    const suiteName = candidate.suiteName.trim();
    const aliasKey = poolAlias.toLowerCase();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(poolName) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(poolAlias) || !suiteName || suiteName.length > 512 || /[\r\n]/.test(suiteName)) return null;
    if (aliases.has(aliasKey)) return null;
    aliases.add(aliasKey);
    mappings.push({ poolName, poolAlias, suiteName });
  }
  return mappings;
}

function migrateLegacySuites(value: unknown): ConfigCoverageMapping[] | null {
  if (!Array.isArray(value)) return null;
  const defaults = new Map(DEFAULT_CONFIG_COVERAGE_MAPPINGS.map((mapping) => [mapping.suiteName.toLowerCase(), mapping]));
  const migrated = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.label !== "string" || typeof candidate.suiteName !== "string") return [];
    const known = defaults.get(candidate.suiteName.trim().toLowerCase());
    if (known) return [{ ...known }];
    const label = candidate.label.trim();
    const suiteName = candidate.suiteName.trim();
    if (!label || !suiteName) return [];
    const alias = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "suite"}_testcycle`.slice(0, 80);
    const poolName = /_B2_/i.test(suiteName) ? "pv_dmr-ap-ap1-b2" : /_B0_P2_/i.test(suiteName) ? "dmr-ap-ap1-b1" : "pv_dmr-ap-ap1-b0";
    return [{ poolName, poolAlias: alias, suiteName }];
  });
  return normalizeConfigCoverageMappings(migrated);
}

export async function getConfigCoverageSettings(): Promise<{ mappings: ConfigCoverageMapping[] }> {
  try {
    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as { mappings?: unknown; suites?: unknown };
    const mappings = normalizeConfigCoverageMappings(saved.mappings) ?? migrateLegacySuites(saved.suites);
    return { mappings: mappings ?? DEFAULT_CONFIG_COVERAGE_MAPPINGS.map((mapping) => ({ ...mapping })) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { mappings: DEFAULT_CONFIG_COVERAGE_MAPPINGS.map((mapping) => ({ ...mapping })) };
  }
}

export async function saveConfigCoverageSettings(value: unknown): Promise<{ mappings: ConfigCoverageMapping[] }> {
  const mappings = normalizeConfigCoverageMappings(value);
  if (!mappings) throw new TypeError("Enter 1 to 12 mappings with unique pool aliases and valid pool and suite names.");
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify({ mappings }, null, 2), { encoding: "utf8", mode: 0o600 });
  return { mappings };
}