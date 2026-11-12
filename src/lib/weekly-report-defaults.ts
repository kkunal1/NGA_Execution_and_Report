import { B0_SUITES } from "./execution-suites";

export const DEFAULT_WEEKLY_REPORT_SUITES = [B0_SUITES.P1, B0_SUITES.P2];
export const DEFAULT_EXECUTION_SUMMARY_TEXT = "- **{{attemptedPct}}** tests have been attempted, with **{{passedPct}} passed**, **{{failedPct}} failed** and **{{blockedPct}} blocked.**\n- Failure analysis and rerun in progress.\n- Execution is currently running with **{{bkc}}**.";

export const EXECUTION_SUMMARY_PREVIEW_VALUES: Record<string, string> = {
	attemptedPct: "42.7%",
	attemptedCount: "540",
	passedPct: "16.2%",
	passedCount: "205",
	failedPct: "23.2%",
	failedCount: "294",
	blockedPct: "0%",
	blockedCount: "0",
	notRunPct: "57.3%",
	notRunCount: "726",
	plannedCount: "1,266",
	yetToAttemptPct: "57.3%",
	yetToAttemptCount: "726",
	bkc: "BKC#46",
};
