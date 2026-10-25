export type StateBucket =
  | "Passed"
  | "Failed"
  | "Blocked"
  | "In Progress"
  | "Not Run"
  | "Other";

export type TestRow = {
  id: string;
  name: string;
  testline: string;
  suite: string;
  /** Raw value of the grid's state column (default: "Last Rerun State"). */
  state: string;
  /** Latest rerun index reported by NGA. */
  rerunIndex?: number;
  bucket: StateBucket;
  owner: string;
  platform: string;
  /** Owner-team domain, from NGA's Validation Group Name (e.g. "pv_memory"). Empty if not available. */
  domain?: string;
  /** ISO end/start time of the test run, used for date-range filtering. Empty if not available. */
  date?: string;
  /** Default-flow step name where an Aborted run was auto-disabled. Empty if not available/applicable. */
  abortStep?: string;
  /** NGA failure bucket name(s) linked to this run's failures. Empty if none. */
  bucketName?: string;
  raw: Record<string, unknown>;
};

export type ScrapeSource = "network" | "dom";

export type Summary = {
  tests: number;
  executionAttempted: number;
  passed: number;
  failed: number;
  bucketized: number;
  bucketizedWithHsd: number;
  bucketizedUnderTriage: number;
  bucketizedNoHsd: number;
  bucketizedWithoutHsd: number;
  blocked: number;
  inProgress: number;
  notRun: number;
  other: number;
  executed: number;
  progressPct: number;
  passRatePct: number;
  byState: { name: string; value: number }[];
  byRawState: { name: string; value: number }[];
  byTestline: {
    testline: string;
    tests: number;
    passed: number;
    failed: number;
    blocked: number;
    inProgress: number;
    notRun: number;
    progressPct: number;
    passRatePct: number;
  }[];
  byDomain: {
    domain: string;
    tests: number;
    passed: number;
    failed: number;
    bucketized: number;
    bucketizedWithHsd: number;
    bucketizedUnderTriage: number;
    bucketizedNoHsd: number;
    bucketizedWithoutHsd: number;
    blocked: number;
    inProgress: number;
    notRun: number;
    passRatePct: number;
  }[];
  failures: TestRow[];
};

export type RunMeta = {
  runId: string;
  capturedAt: string;
  url: string;
  filter: { entity: string; field: string; operator: string; value: string };
  source: ScrapeSource;
  stateColumn: string;
  gridUnlocked: boolean;
  filterVerified: boolean;
  /** What the filter row actually read back as: [entity, field, operator]. */
  appliedCondition: string[];
  reportedTotal: number | null;
  durationMs: number;
  warnings: string[];
  observedEndpoints: string[];
  sampleRecord: Record<string, unknown> | null;
};

export type RunResult = {
  meta: RunMeta;
  rows: TestRow[];
  summary: Summary;
};

export type StepInfo = { name: string; state: string };
export type StepGroups = { PreBoot: StepInfo[]; PostTest: StepInfo[]; Cleanup: StepInfo[] };
