import { bucketOf, normalizeSuiteNames, toText } from "./normalize";
import { summarize } from "./summarize";
import { fetchAbortedTests, fetchNGAiSuite, NGAI_SUITE_NAME } from "./ngai-client";
import type { NetworkOverride } from "./proxy";
import type { StepGroups, TestRow } from "./types";

export function normalizeRunRecord(record: Record<string, unknown>, index: number): TestRow {
  const revision = (record.testLineRevision ?? record.TestLineRevision) as Record<string, unknown> | null;
  const testLine = (record.testLine ?? record.TestLine) as Record<string, unknown> | null;
  const validationGroup = (record.validationGroup ?? record.ValidationGroup) as Record<string, unknown> | null;
  const autoDisablingTestStep = (record.autoDisablingTestStep ?? record.AutoDisablingTestStep) as Record<string, unknown> | null;
  const state = toText(record.state ?? record.stateDescription ?? "(empty)");
  const goStatus = toText(record.goStatus ?? record.GoStatus ?? record["Go Status"] ?? testLine?.goStatus ?? testLine?.GoStatus);
  const testline = toText(revision?.testLineName ?? revision?.TestLineName ?? testLine?.testLineName ?? testLine?.Name);
  const testSuite = (revision?.testSuite ?? revision?.TestSuite) as Record<string, unknown> | null;
  const suite = toText(revision?.testSuiteName ?? revision?.TestSuiteName ?? testSuite?.testSuiteName ?? testSuite?.TestSuiteName ?? record.requestedSuiteName);
  const failures = (record.failure ?? record.Failure) as Record<string, unknown>[] | null;
  const bucketNames = [...new Set((Array.isArray(failures) ? failures : [])
    .map((f) => {
      const b = (f?.bucket ?? f?.Bucket) as Record<string, unknown> | null;
      return toText(b?.bucketName ?? b?.BucketName);
    })
    .filter(Boolean))];
  return {
    id: toText(record.testRunId ?? record.id ?? record.Id) || `${index}`,
    name: toText(record.udmTestId ?? record.testRunId ?? record.Name) || `run-${index + 1}`,
    testline,
    suite,
    state,
    bucket: bucketOf(state, goStatus),
    owner: toText(record.submittedBy ?? record.updatedBy),
    platform: toText(record.vType),
    domain: toText(validationGroup?.testGroupName ?? validationGroup?.TestGroupName),
    date: toText(record.testEndDateTime ?? record.TestEndDateTime ?? record.testStartDateTime ?? record.TestStartDateTime),
    abortStep: toText(autoDisablingTestStep?.testStepName ?? autoDisablingTestStep?.TestStepName),
    bucketName: bucketNames.join("; "),
    raw: record,
  };
}

export async function loadTestRunQuery(suiteInput: string | string[] = NGAI_SUITE_NAME, network?: NetworkOverride): Promise<{
  url: string;
  loaded: number;
  summary: ReturnType<typeof summarize>;
  rows: TestRow[];
  warnings: string[];
  steps: StepGroups;
  stepsFor: string | null;
}> {
  const suiteNames = normalizeSuiteNames(suiteInput);
  const result = await fetchNGAiSuite(suiteNames.length ? suiteNames : NGAI_SUITE_NAME, network);
  const rows = result.records.map(normalizeRunRecord);
  const suiteLabel = suiteNames.length ? suiteNames.join(", ") : NGAI_SUITE_NAME;
  const warnings = rows.length
    ? []
    : [`No Intel NGAi TestRunComposite records matched suites "${suiteLabel}".`];
  if (result.truncated) {
    warnings.push(`Stopped after the pagination safety limit; more records may exist for suites "${suiteLabel}".`);
  }
  return {
    url: result.url,
    loaded: rows.length,
    summary: summarize(rows),
    rows,
    warnings,
    steps: { PreBoot: [], PostTest: [], Cleanup: [] },
    stepsFor: null,
  };
}

export async function loadAbortedTests(suiteInput: string | string[] = NGAI_SUITE_NAME, network?: NetworkOverride): Promise<{
  total: number;
  rows: TestRow[];
  warnings: string[];
}> {
  const suiteNames = normalizeSuiteNames(suiteInput);
  const result = await fetchAbortedTests(suiteNames.length ? suiteNames : NGAI_SUITE_NAME, network);
  const rows = result.records.map(normalizeRunRecord);
  const suiteLabel = suiteNames.length ? suiteNames.join(", ") : NGAI_SUITE_NAME;
  const warnings = result.truncated
    ? [`Stopped after the pagination safety limit; more aborted records may exist for suites "${suiteLabel}".`]
    : [];
  return { total: rows.length, rows, warnings };
}
