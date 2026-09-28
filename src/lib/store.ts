import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import type { RunResult } from "./types";

const LATEST = "latest.json";
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

async function ensureDirs() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.reportsDir, { recursive: true });
  await fs.mkdir(config.artifactsDir, { recursive: true });
}

export async function saveRun(run: RunResult): Promise<void> {
  await ensureDirs();
  const body = JSON.stringify(run, null, 2);
  await fs.writeFile(path.join(config.dataDir, `${run.meta.runId}.json`), body, "utf8");
  await fs.writeFile(path.join(config.dataDir, LATEST), body, "utf8");
}

export async function loadLatest(): Promise<RunResult | null> {
  try {
    const body = await fs.readFile(path.join(config.dataDir, LATEST), "utf8");
    return JSON.parse(body) as RunResult;
  } catch {
    return null;
  }
}

export async function listRuns(): Promise<string[]> {
  try {
    const files = await fs.readdir(config.dataDir);
    return files
      .filter((f) => f.endsWith(".json") && f !== LATEST)
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function loadRun(runId: string): Promise<RunResult | null> {
  // Guard against path traversal via the runId query parameter.
  if (!SAFE_ID.test(runId)) return null;
  try {
    const body = await fs.readFile(path.join(config.dataDir, `${runId}.json`), "utf8");
    return JSON.parse(body) as RunResult;
  } catch {
    return null;
  }
}

export async function saveReport(runId: string, html: string): Promise<string> {
  if (!SAFE_ID.test(runId)) throw new Error("Invalid run id");
  await ensureDirs();
  const file = path.join(config.reportsDir, `execution-report-${runId}.html`);
  await fs.writeFile(file, html, "utf8");
  return file;
}
