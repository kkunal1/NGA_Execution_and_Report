import type { Page } from "playwright";
import { looksLikeLogin, openSession } from "./browser";
import { config } from "./config";
import { bucketOf, findReportedTotal, harvestRecords, looksLikeTestRecord, normalizeSuiteNames, toText } from "./normalize";
import { summarize } from "./summarize";
import type { RunResult, TestRow } from "./types";

export class AuthRequiredError extends Error {}
type Capture = { url: string; payload: unknown };

function normalizeRow(record: Record<string, unknown>, index: number, suiteName: string): TestRow {
  const state = toText(record[config.stateColumn] ?? record.state ?? record.status) || "(empty)";
  const goStatus = toText(record["Go Status"] ?? record.goStatus ?? record.GoStatus);
  const testline = toText(record["Testline Name"] ?? record.testline ?? record.testLine);
  const name = toText(record.Name ?? record.name ?? record.testName) || `row-${index + 1}`;
  return {
    id: toText(record.id ?? record.Id ?? record.testId) || `${index}`,
    name,
    testline,
    suite: suiteName || toText(record.Suite ?? record.suite) || testline,
    state,
    bucket: bucketOf(state, goStatus),
    owner: toText(record.owner ?? record.Owner),
    platform: toText(record.platform ?? record.Platform),
    raw: record,
  };
}

async function clickButton(page: Page, pattern: RegExp, timeout = 5000) {
  const button = page.locator("button").filter({ hasText: pattern }).first();
  if (!(await button.isVisible({ timeout }).catch(() => false))) return false;
  await button.click({ timeout }).catch(() => undefined);
  return true;
}

async function clickOption(page: Page, value: string) {
  const label = page.locator('[role="option"] .lbl').filter({ hasText: new RegExp(`^\\s*${value}\\s*$`, "i") }).first();
  if (await label.isVisible({ timeout: 3000 }).catch(() => false)) {
    await label.click();
    return;
  }
  const options = page.locator('[role="option"]').filter({ hasText: new RegExp(`\\b${value}\\b`, "i") });
  const option = value.toLowerCase() === "equal" ? options.filter({ hasNotText: /not\s+equal/i }).first() : options.first();
  await option.click({ timeout: 5000 });
}

async function configureFilter(page: Page, suiteName: string) {
  await clickButton(page, /clear all|^clear$/i, 2000);
  await clickButton(page, /condition/i);
  const conditionRows = page.locator(".cond");
  const row = (await conditionRows.count())
    ? conditionRows.last()
    : page.locator('.query-row, [role="row"]').filter({ has: page.locator("input") }).last();
  const controls = row.locator('[role="combobox"], select');
  const expected = [config.filterEntity, config.filterField, config.filterOperator];
  if (await controls.count() >= 3) {
    for (const [index, value] of expected.entries()) {
      const control = controls.nth(index);
      await control.click().catch(() => undefined);
      const option = page.locator('[role="option"] .lbl').filter({ hasText: new RegExp(`^\\s*${value}\\s*$`, "i") }).first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) await option.click();
      else if (await control.evaluate((node) => node.tagName === "SELECT").catch(() => false)) await control.selectOption({ label: value });
    }
  } else {
    const buttons = row.locator('[role="combobox"], .cb');
    if (await buttons.count() < 3) {
      throw new Error("Intel SSO filter controls were not found. Select Intel NGAi in Settings for direct TestRunComposite retrieval, or verify the NGA Testlines page is loaded.");
    }
    for (const [index, value] of expected.entries()) {
      await buttons.nth(index).click();
      await clickOption(page, value);
    }
  }
  await row.locator('input[type="text"], input').last().fill(suiteName);
  const mockControls = row.locator(".cb");
  const values = await (await mockControls.count() >= 3
    ? mockControls.allTextContents()
    : row.locator('[role="combobox"], select').allTextContents()).catch(() => [] as string[]);
  return values.map((value) => value.trim()).filter(Boolean).slice(0, 3);
}

export async function scrapeTestlines(options: { headless?: boolean; suiteName?: string; suiteNames?: string[] } = {}): Promise<RunResult> {
  const started = Date.now();
  const suiteNames = normalizeSuiteNames(options.suiteNames ?? options.suiteName ?? config.suiteName);
  const selectedSuites = suiteNames.length ? suiteNames : [config.suiteName];
  const captures: Capture[] = [];
  const capturesBySuite: Capture[][] = [];
  const appliedConditions: string[][] = [];
  const records: Record<string, unknown>[] = [];
  const rows: TestRow[] = [];
  let reportedTotal = 0;
  let hasReportedTotal = false;
  const observed = new Set<string>();
  const session = await openSession({ headless: options.headless ?? config.headless });
  const page = session.context.pages()[0] ?? (await session.context.newPage());
  page.on("response", (response) => {
    observed.add(response.url());
    if (!/json/i.test(response.headers()["content-type"] ?? "") || !/(testline|testLine|query)/i.test(response.url())) return;
    void response.json().then((payload) => captures.push({ url: response.url(), payload })).catch(() => undefined);
  });
  try {
    await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    if (looksLikeLogin(page.url(), await page.title())) throw new AuthRequiredError("NGA requires Intel SSO. Run `npm run auth` once, then retry.");
    const unlocked = await clickButton(page, new RegExp(config.unlockButton, "i"), 2500);
    if (unlocked) await page.waitForTimeout(config.settleMs);
    for (const suiteName of selectedSuites) {
      captures.length = 0;
      const appliedCondition = await configureFilter(page, suiteName);
      appliedConditions.push(appliedCondition);
      await clickButton(page, /^search$/i);
      await page.waitForTimeout(config.settleMs);
      const captureWaitMs = capturesBySuite.length === 0 ? config.navTimeoutMs : config.settleMs;
      const deadline = Date.now() + captureWaitMs;
      while (!captures.length && Date.now() < deadline) await page.waitForTimeout(250);
      const suiteCaptures = [...captures];
      capturesBySuite.push(suiteCaptures);
      const suiteRecords = suiteCaptures.flatMap(({ payload }) => harvestRecords(payload, looksLikeTestRecord));
      records.push(...suiteRecords);
      const total = suiteCaptures[0] ? findReportedTotal(suiteCaptures[0].payload) : null;
      if (total != null) {
        reportedTotal += total;
        hasReportedTotal = true;
      }
      const suiteRows = suiteRecords.map((record, index) => normalizeRow(record, rows.length + index, suiteName));
      if (!suiteRows.length) {
        const domRows = await page.locator("tr").evaluateAll((trs) => trs.slice(1).map((tr) => {
          const cells = [...tr.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? "");
          return { Name: cells[0], "Testline Name": cells[1], "Last Rerun State": cells[2], "Go Status": cells[3] };
        })).catch(() => []);
        suiteRows.push(...domRows.filter((row) => row.Name).map((row, index) => normalizeRow(row, rows.length + index, suiteName)));
      }
      rows.push(...suiteRows);
    }
    const appliedCondition = appliedConditions.at(-1) ?? [];
    const expected = [config.filterEntity, config.filterField, config.filterOperator];
    const filterVerified = appliedConditions.length === selectedSuites.length && appliedConditions.every((condition) =>
      condition.length >= 3 && condition.slice(0, 3).every((value, index) => value.toLowerCase() === expected[index].toLowerCase()),
    );
    const meta = {
      runId: new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17),
      capturedAt: new Date().toISOString(), url: config.url,
      filter: { entity: config.filterEntity, field: config.filterField, operator: config.filterOperator, value: selectedSuites.join("\n") },
      source: capturesBySuite.some((suiteCapture) => suiteCapture.length) ? "network" as const : "dom" as const, stateColumn: config.stateColumn,
      gridUnlocked: unlocked,
      filterVerified,
      appliedCondition, reportedTotal: hasReportedTotal ? reportedTotal : rows.length,
      durationMs: Date.now() - started,
      warnings: rows.length ? [] : [`No records were returned for suites: ${selectedSuites.join(", ")}.`],
      observedEndpoints: [...observed].slice(0, 30), sampleRecord: records[0] ?? null,
    };
    return { meta, rows, summary: summarize(rows) };
  } finally {
    await session.close();
  }
}
