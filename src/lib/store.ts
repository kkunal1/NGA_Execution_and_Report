import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { config } from "./config";
import type { RunResult } from "./types";

const LATEST = "latest.json";
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const RUN_FILE = /^(?:\d{17}|\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/;

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

export async function saveLatestIfChanged(run: RunResult): Promise<{ changed: boolean; run: RunResult; version: string | null }> {
  await fs.mkdir(config.dataDir, { recursive: true });
  const existing = await loadLatest();
  const signature = (value: RunResult) => createHash("sha256").update(JSON.stringify(value.rows)).digest("hex");
  if (existing && signature(existing) === signature(run)) {
    return { changed: false, run: existing, version: await getLatestVersion() };
  }
  await fs.writeFile(path.join(config.dataDir, LATEST), JSON.stringify(run, null, 2), "utf8");
  return { changed: true, run, version: await getLatestVersion() };
}

export async function getLatestVersion(): Promise<string | null> {
  try {
    const stat = await fs.stat(path.join(config.dataDir, LATEST));
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
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
      .filter((f) => RUN_FILE.test(f))
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
