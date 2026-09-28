import { bucketOf, toText } from "./normalize";
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
  const testline = toText(revision?.testLineName ?? revision?.TestLineName ?? testLine?.testLineName ?? testLine?.Name);
  const suite = toText(revision?.testSuiteName ?? (revision?.testSuite as Record<string, unknown> | null)?.testSuiteName);
  return {
    id: toText(record.testRunId ?? record.id ?? record.Id) || `${index}`,
    name: toText(record.udmTestId ?? record.testRunId ?? record.Name) || `run-${index + 1}`,
    testline,
    suite,
    state,
    bucket: bucketOf(state),
    owner: toText(record.submittedBy ?? record.updatedBy),
    platform: toText(record.vType),
    domain: toText(validationGroup?.testGroupName ?? validationGroup?.TestGroupName),
    date: toText(record.testEndDateTime ?? record.TestEndDateTime ?? record.testStartDateTime ?? record.TestStartDateTime),
    abortStep: toText(autoDisablingTestStep?.testStepName ?? autoDisablingTestStep?.TestStepName),
    raw: record,
  };
}

export async function loadTestRunQuery(suiteName = NGAI_SUITE_NAME, network?: NetworkOverride): Promise<{
  url: string;
  loaded: number;
  summary: ReturnType<typeof summarize>;
  rows: TestRow[];
  warnings: string[];
  steps: StepGroups;
  stepsFor: string | null;
}> {
  const result = await fetchNGAiSuite(suiteName, network);
  const rows = result.records.map(normalizeRunRecord);
  const warnings = rows.length
    ? []
    : [`No Intel NGAi TestRunComposite records matched suite "${suiteName}".`];
  if (result.truncated) {
    warnings.push(`Stopped after the pagination safety limit; more records may exist for suite "${suiteName}".`);
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

export async function loadAbortedTests(suiteName = NGAI_SUITE_NAME, network?: NetworkOverride): Promise<{
  total: number;
  rows: TestRow[];
  warnings: string[];
}> {
  const result = await fetchAbortedTests(suiteName, network);
  const rows = result.records.map(normalizeRunRecord);
  const warnings = result.truncated
    ? [`Stopped after the pagination safety limit; more aborted records may exist for suite "${suiteName}".`]
    : [];
  return { total: rows.length, rows, warnings };
}
