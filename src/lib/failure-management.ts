import "server-only";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { TestRow } from "./types";

const execFile = promisify(execFileCallback);

export type FailureEntry = {
  id: string;
  testline: string;
  suite: string;
  bucketName: string;
  pvimId: string | null;
  hsdIds: string[];
  linkedIds: string[];
  status: "added" | "not-added" | "not-verified" | "no-hsd";
  detail: string;
};

export type FailureSearchResult = {
  capturedAt: string | null;
  checkedAt: string | null;
  domains: string[];
  domain: string;
  rows: FailureEntry[];
};

function readBugIds(value: unknown): string[] | null {
  if (value === null || value === "") return [];
  if (typeof value === "string" || typeof value === "number") {
    const ids = String(value).match(/\b\d{10,}\b/g);
    return ids ?? null;
  }
  if (Array.isArray(value)) {
    const lists = value.map(readBugIds);
    return lists.some((list) => list === null) ? null : lists.flatMap((list) => list ?? []);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ["article_id", "target_id", "id", "url", "href", "value"]) {
      if (Object.hasOwn(record, key)) return readBugIds(record[key]);
    }
  }
  return null;
}

async function readPvimBugIds(id: string): Promise<string[]> {
  const { stdout } = await execFile(process.platform === "win32" ? "curl.exe" : "curl", [
    "--negotiate", "--user", ":", "--silent", "--show-error", "--max-time", "20",
    "--request", "GET", "--header", "Accept: application/json",
    "--write-out", "\nHTTP_STATUS:%{http_code}",
    `https://hsdes.intel.com/rest/article/${id}`,
  ], { timeout: 25_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  const marker = "\nHTTP_STATUS:";
  const index = stdout.lastIndexOf(marker);
  if (index < 0) throw new Error("Unrecognized HSDES response.");
  const status = Number(stdout.slice(index + marker.length).trim());
  if (status === 401 || status === 403) throw new Error(`HSDES access denied (HTTP ${status}).`);
  if (status !== 200) throw new Error(`HSDES lookup returned HTTP ${status}.`);
  const payload = JSON.parse(stdout.slice(0, index)) as { data?: unknown };
  const article = Array.isArray(payload.data) ? payload.data[0] as unknown : null;
  if (!article || typeof article !== "object" || !Object.hasOwn(article, "bug_id")) {
    throw new Error("bug_id was not returned by the article API.");
  }
  const ids = readBugIds((article as Record<string, unknown>).bug_id);
  if (ids === null) throw new Error("bug_id link format could not be verified.");
  return [...new Set(ids)];
}

export async function inspectFailures(rows: TestRow[]): Promise<FailureEntry[]> {
  const entries: FailureEntry[] = rows.map((row) => ({
    id: row.id,
    testline: row.testline,
    suite: row.suite,
    bucketName: row.bucketName ?? "",
    pvimId: /^\d{10,}-(\d{10,})-/.exec(row.testline)?.[1] ?? null,
    hsdIds: [...new Set(row.bucketName?.match(/\d{10,}/g) ?? [])],
    linkedIds: [],
    status: "not-verified",
    detail: "",
  }));
  const ids = [...new Set(entries.filter((entry) => entry.hsdIds.length && entry.pvimId).map((entry) => entry.pvimId!))];
  const lookups = new Map<string, { ids?: string[]; error?: string }>();
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (nextIndex < ids.length) {
      const id = ids[nextIndex++];
      try {
        lookups.set(id, { ids: await readPvimBugIds(id) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "HSDES lookup failed.";
        lookups.set(id, { error: message.includes("HSDES") || message.startsWith("bug_id") ? message : "Could not read HSDES. Check host Kerberos access." });
      }
    }
  }));
  return entries.map((entry) => {
    if (!entry.hsdIds.length) return { ...entry, status: "no-hsd", detail: "No HSD ID in the NGA bucket." };
    if (!entry.pvimId) return { ...entry, detail: "PVIM Result ID could not be identified from the TestLine name." };
    const lookup = lookups.get(entry.pvimId);
    if (!lookup?.ids) return { ...entry, detail: lookup?.error ?? "Lookup unavailable." };
    const missing = entry.hsdIds.filter((id) => !lookup.ids!.includes(id));
    return {
      ...entry,
      linkedIds: lookup.ids,
      status: missing.length ? "not-added" : "added",
      detail: missing.length ? `Missing from bug_id: ${missing.join(", ")}` : "All bucket HSD IDs are present in bug_id.",
    };
  });
}