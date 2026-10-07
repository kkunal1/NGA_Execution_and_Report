import type { StateBucket, Summary, TestRow } from "./types";

// Fallback classification from testline name keywords, used only when a row has no
// real "domain" (NGA's Validation Group Name, e.g. "pv_memory") - e.g. SSO-captured rows.
// Order matters: more specific/distinctive patterns must come before broader ones.
const DOMAIN_RULES: { domain: string; pattern: RegExp }[] = [
  { domain: "pv_seamless", pattern: /seamless/i },
  { domain: "pv_security", pattern: /security|tdx|sgx|boot_?guard|\btme\b|trust_?domain|\btd[-_]/i },
  { domain: "pv_manageability", pattern: /manageability|\bbmc\b|espi|redfish|\bipmi\b|\bamt\b/i },
  { domain: "pv_power_management", pattern: /power_management|\bpm[-_]|tpmi|c-?state|p-?state/i },
  { domain: "pv_memory", pattern: /\bmem[-_]|memory|\budimm\b|\brdimm\b|\bddr\d?\b/i },
  { domain: "pv_ras", pattern: /\bras\b|\bmca\b|machine_check|\becc\b|poison|sighting/i },
  { domain: "pv_virtualization", pattern: /virtualization|\bkvm\b|vt-?d|vt-?x|sriov|hyper-?v/i },
  { domain: "pv_reset", pattern: /reset_test|reset|\bg3\b|\bperst\b/i },
  { domain: "pv_serial_io", pattern: /pci_?express|\bpcie\b|\bcxl\b|serial_io/i },
];

function domainOf(row: TestRow): string {
  if (row.domain) return row.domain;
  const rule = DOMAIN_RULES.find((r) => r.pattern.test(row.testline));
  return rule ? rule.domain : "Other";
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

const BUCKETS: StateBucket[] = [
  "Passed",
  "Failed",
  "Blocked",
  "In Progress",
  "Not Run",
  "Other",
];

function countBuckets(rows: TestRow[]) {
  const c: Record<StateBucket, number> = {
    Passed: 0,
    Failed: 0,
    Blocked: 0,
    "In Progress": 0,
    "Not Run": 0,
    Other: 0,
  };
  for (const r of rows) c[r.bucket] += 1;
  return c;
}

const countBucketized = (rows: TestRow[]) =>
  rows.filter((r) => r.bucket === "Failed" && r.bucketName).length;

export function summarize(rows: TestRow[]): Summary {
  const c = countBuckets(rows);
  const executed = c.Passed + c.Failed + c.Blocked;

  const rawCounts = new Map<string, number>();
  for (const r of rows) rawCounts.set(r.state, (rawCounts.get(r.state) ?? 0) + 1);

  const lineMap = new Map<string, TestRow[]>();
  for (const r of rows) {
    const key = r.testline || "(unspecified)";
    const bucket = lineMap.get(key);
    if (bucket) bucket.push(r);
    else lineMap.set(key, [r]);
  }

  const byTestline = [...lineMap.entries()]
    .map(([testline, list]) => {
      const t = countBuckets(list);
      const ex = t.Passed + t.Failed + t.Blocked;
      return {
        testline,
        tests: list.length,
        passed: t.Passed,
        failed: t.Failed,
        blocked: t.Blocked,
        inProgress: t["In Progress"],
        notRun: t["Not Run"],
        progressPct: pct(ex, list.length),
        passRatePct: pct(t.Passed, list.length),
      };
    })
    .sort((a, b) => b.tests - a.tests);

  const domainMap = new Map<string, TestRow[]>();
  for (const r of rows) {
    const key = domainOf(r);
    const bucket = domainMap.get(key);
    if (bucket) bucket.push(r);
    else domainMap.set(key, [r]);
  }

  const byDomain = [...domainMap.entries()]
    .map(([domain, list]) => {
      const t = countBuckets(list);
      const ex = t.Passed + t.Failed + t.Blocked;
      return {
        domain,
        tests: list.length,
        passed: t.Passed,
        failed: t.Failed,
        bucketized: countBucketized(list),
        blocked: t.Blocked,
        inProgress: t["In Progress"],
        notRun: t["Not Run"],
        passRatePct: pct(t.Passed, list.length),
      };
    })
    .sort((a, b) => b.tests - a.tests);

  return {
    tests: rows.length,
    passed: c.Passed,
    failed: c.Failed,
    bucketized: countBucketized(rows),
    blocked: c.Blocked,
    inProgress: c["In Progress"],
    notRun: c["Not Run"],
    other: c.Other,
    executed,
    progressPct: pct(executed, rows.length),
    passRatePct: pct(c.Passed, rows.length),
    byState: BUCKETS.map((b) => ({ name: b, value: c[b] })).filter((s) => s.value > 0),
    byRawState: [...rawCounts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    byTestline,
    byDomain,
    failures: rows.filter((r) => r.bucket === "Failed" || r.bucket === "Blocked"),
  };
}
