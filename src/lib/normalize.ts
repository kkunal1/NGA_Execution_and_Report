import type { StateBucket, TestRow } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function pick(rec: Record<string, unknown>, candidates: string[]): unknown {
  const entries = Object.entries(rec).map(
    ([k, v]) => [norm(k), v] as [string, unknown],
  );
  for (const c of candidates.map(norm)) {
    const hit = entries.find(([k]) => k === c);
    if (hit && hit[1] != null && hit[1] !== "") return hit[1];
  }
  for (const c of candidates.map(norm)) {
    const hit = entries.find(([k]) => k.includes(c));
    if (hit && hit[1] != null && hit[1] !== "") return hit[1];
  }
  return undefined;
}

export function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v).trim();
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["name", "title", "label", "value", "displayName", "state", "id"]) {
      if (o[k] != null && typeof o[k] !== "object") return String(o[k]).trim();
    }
  }
  return "";
}

/** Map any NGA state string onto a reporting bucket. */
export function bucketOf(state: string): StateBucket {
  const s = state.toLowerCase().trim();
  if (!s || /^(n\/?a|-|none|null|undefined)$/.test(s)) return "Not Run";
  // "PendingGatekeepers" is waiting on approval, i.e. blocked - checked before the generic "pending" match below.
  if (/gatekeeper/.test(s)) return "Blocked";
  // "PendingRunning" is NGA's queued-but-not-started state, not actually in progress.
  if (/not\s*run|not\s*exec|unexecuted|new\b|created|planned|todo|pending|queue/.test(s))
    return "Not Run";
  if (/pass|success|complete[d]?\s*ok|clean/.test(s)) return "Passed";
  // Blocked is checked before failed so "Infra Error" is not counted as a failure.
  if (/block|abort|infra|setup\s*issue|cancel|skip|invalid|env\s*issue/.test(s))
    return "Blocked";
  if (/fail|error|reject/.test(s)) return "Failed";
  if (/in\s*-?\s*progress/.test(s)) return "In Progress";
  return "Other";
}

const NAME_KEYS = [
  "testname",
  "testcasename",
  "test case",
  "testcase",
  "title",
  "name",
  "test",
];
const TESTLINE_KEYS = ["testlinename", "testline", "line", "suitename", "suite"];

export function makeRowFactory(stateColumn: string) {
  const stateKeys = [
    stateColumn,
    "lastrerunstate",
    "rerunstate",
    "laststate",
    "executionstate",
    "runstate",
    "status",
    "state",
    "result",
  ];

  return function normalizeRow(
    rec: Record<string, unknown>,
    index: number,
  ): TestRow {
    const state = toText(pick(rec, stateKeys));
    const testline = toText(pick(rec, TESTLINE_KEYS));
    return {
      id: toText(pick(rec, ["testid", "testcaseid", "id", "key", "uuid"])) || `${index}`,
      name: toText(pick(rec, NAME_KEYS)) || `row-${index + 1}`,
      testline,
      suite: toText(pick(rec, ["testlinesuite", "suitename", "suite", "cycle"])) || testline,
      state: state || "(empty)",
      bucket: bucketOf(state),
      owner: toText(pick(rec, ["owner", "assignee", "user", "wwid", "reporter"])),
      platform: toText(pick(rec, ["platform", "program", "project", "product"])),
      raw: rec,
    };
  };
}

/** A record is interesting when it carries a name-ish key and a state-ish key. */
export function looksLikeTestRecord(rec: unknown): boolean {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return false;
  const keys = Object.keys(rec as object).map(norm);
  if (keys.length < 2) return false;
  const hasName = keys.some((k) => /name|title|test|testline/.test(k));
  const hasState = keys.some((k) =>
    /state|status|result|verdict|rerun|pass|fail/.test(k),
  );
  return hasName && hasState;
}

/** A TestRunComposite-shaped record: an execution result joined to its testline by id. */
export function looksLikeRunRecord(rec: unknown): boolean {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return false;
  const r = rec as Record<string, unknown>;
  const hasState = typeof r.state === "string" || typeof r.stateDescription === "string";
  const hasTestLineId =
    typeof r.testLineId === "string" ||
    typeof r.TestLineId === "string" ||
    typeof r.testLineId === "number" ||
    typeof r.TestLineId === "number";
  return hasState && hasTestLineId;
}

/** Total-count hints returned alongside paged payloads. */
export function findReportedTotal(payload: unknown): number | null {
  let found: number | null = null;
  const walk = (node: unknown, depth: number) => {
    if (found != null || depth > 6 || node == null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v, depth + 1);
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (
        typeof v === "number" &&
        /^(total|totalcount|totalrecords|totalelements|recordstotal|count|numfound)$/i.test(
          k.replace(/[^a-z]/gi, ""),
        )
      ) {
        found = v;
        return;
      }
      walk(v, depth + 1);
    }
  };
  walk(payload, 0);
  return found;
}

/** Walk an arbitrary JSON payload and harvest the largest array matching `predicate`. */
export function harvestRecords(
  payload: unknown,
  predicate: (rec: unknown) => boolean = looksLikeTestRecord,
): Record<string, unknown>[] {
  let best: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || node == null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      const hits = node.filter(predicate) as Record<string, unknown>[];
      if (hits.length > best.length) best = hits;
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      walk(value, depth + 1);
    }
  };

  walk(payload, 0);
  return best;
}
