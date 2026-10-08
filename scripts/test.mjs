// Sanity checks for state bucketing and payload harvesting.
// Run with: npm run test
import assert from "node:assert/strict";
import { bucketOf, harvestRecords, makeRowFactory, findReportedTotal, normalizeSuiteNames } from "../src/lib/normalize.ts";
import { summarize } from "../src/lib/summarize.ts";
import { chooseExactIndex, scoped } from "../src/lib/selectors.ts";
import { checkCondition, matchesExactly } from "../src/lib/verify.ts";
import { decryptNgaiToken, encryptNgaiToken } from "../src/lib/ngai-token-crypto.ts";
import { buildReportFilename } from "../src/lib/report-filename.ts";
import { getWorkWeeks } from "../src/lib/work-weeks.ts";

const encryptionKey = Buffer.alloc(32, 7);
const encryptedToken = encryptNgaiToken("sample-pat", encryptionKey);
assert.notEqual(encryptedToken.ciphertext, "sample-pat");
assert.equal(decryptNgaiToken(encryptedToken, encryptionKey), "sample-pat");
assert.throws(() => decryptNgaiToken(encryptedToken, Buffer.alloc(32, 8)), /Could not decrypt/);
assert.deepEqual(
  normalizeSuiteNames([" Suite One ", "", "suite one", "Suite Two\nSuite Three"]),
  ["Suite One", "Suite Two", "Suite Three"],
);
const multiSuiteFilename = buildReportFilename("Suite_One\nSuite_Two");
assert.ok(!/[\r\n\t]/.test(multiSuiteFilename), "report filename must not contain control characters");
assert.ok(multiSuiteFilename.startsWith("Suite_One_Suite_Two_"));

assert.equal(
  scoped('[data-nga-row="1"] ', 'select, [role="combobox"]'),
  '[data-nga-row="1"] select, [data-nga-row="1"] [role="combobox"]',
  "scoped() must prefix every branch",
);
assert.equal(scoped("", "select, input"), "select, input");

// Dropdown option picking: "Name" must never resolve to the "GoalName" listed first.
assert.equal(chooseExactIndex(["GoalName", "Name", "NameSpace"], "Name"), 1);
assert.equal(chooseExactIndex(["GoalName", "NameSpace"], "Name"), -1);
assert.equal(chooseExactIndex(["  Name \n", "GoalName"], "Name"), 0);
assert.equal(chooseExactIndex(["Not Equal", "Equal"], "Equal"), 1);
assert.equal(chooseExactIndex(["TestCase", "TestLine"], "TestLine"), 1);
assert.equal(chooseExactIndex([], "Name"), -1);

// Filter verification: "GoalName" must never satisfy an expected "Name".
const expected = {
  entity: "TestLine",
  field: "Name",
  operator: "Equal",
  value: "Oak_Stream_Platform_1_DMR",
};

assert.deepEqual(
  checkCondition(expected, {
    controls: ["TestLine", "Name", "Equal"],
    inputs: ["Oak_Stream_Platform_1_DMR"],
  }),
  [],
  "exact row must pass",
);

const goalName = checkCondition(expected, {
  controls: ["TestLine", "GoalName", "Equal"],
  inputs: ["Oak_Stream_Platform_1_DMR"],
});
assert.equal(goalName.length, 1, "GoalName must be rejected");
assert.match(goalName[0], /field box should be "Name" but shows "GoalName"/);

assert.equal(
  checkCondition(expected, {
    controls: ["TestLine", "Name arrow_drop_down", "Equal"],
    inputs: ["Oak_Stream_Platform_1_DMR"],
  }).length,
  0,
  "dropdown chrome must be ignored",
);

assert.equal(
  checkCondition(expected, { controls: ["TestLine", "Name", "Equal"], inputs: [] }).length,
  1,
  "missing value must be reported",
);
assert.equal(
  checkCondition(expected, { controls: [], inputs: [] }).length,
  4,
  "empty row must report every box",
);

assert.ok(matchesExactly("Name", "Name"));
assert.ok(!matchesExactly("GoalName", "Name"));
assert.ok(!matchesExactly("", "Name"));
assert.ok(matchesExactly("Not Equal", "Not Equal"));
assert.ok(!matchesExactly("Not Equal", "Equal"), "substring operators must not match");


const cases = [
  ["Passed", "Passed"],
  ["PASS", "Passed"],
  ["Failed", "Failed"],
  ["Test Failed", "Failed"],
  ["Infra Error", "Blocked"],
  ["Aborted", "Blocked"],
  ["Skipped", "Blocked"],
  ["InProgress", "In Progress"],
  ["In Progress", "In Progress"],
  ["PendingRunning", "Not Run"],
  ["PendingGatekeepers", "Not Run"],
  ["In Queue", "Not Run"],
  ["Not Run", "Not Run"],
  ["", "Not Run"],
  ["N/A", "Not Run"],
  ["Weird Thing", "Other"],
];
for (const [input, expected] of cases) {
  assert.equal(bucketOf(input), expected, `bucketOf("${input}")`);
}
assert.equal(bucketOf("PendingGatekeepers", "Blocked"), "Blocked");
assert.equal(bucketOf("PendingGatekeeper", "Blocked"), "Blocked");
assert.equal(bucketOf("PendingGatekeepers", "Go"), "Not Run");
assert.equal(bucketOf("PendingGatekeeper", "Go"), "Not Run");
assert.equal(bucketOf("PendingGatekeepers", "blocked"), "Blocked");

const payload = {
  data: {
    total: 3,
    items: [
      { Name: "test_a", "Testline Name": "TL1", "Last Rerun State": "Passed" },
      { Name: "test_b", "Testline Name": "TL1", "Last Rerun State": "Failed" },
      { Name: "test_c", "Testline Name": "TL1", "Last Rerun State": "Not Run" },
    ],
  },
};

const records = harvestRecords(payload);
assert.equal(records.length, 3, "harvestRecords count");
assert.equal(findReportedTotal(payload), 3, "reported total");

const toRow = makeRowFactory("Last Rerun State");
const rows = records.map(toRow);
assert.equal(rows[0].name, "test_a");
assert.equal(rows[0].testline, "TL1");
assert.equal(rows[1].bucket, "Failed");
assert.equal(
  toRow({ Name: "gatekeeper_blocked", "Last Rerun State": "PendingGatekeepers", "Go Status": "Blocked" }, 3).bucket,
  "Blocked",
);
assert.equal(
  toRow({ Name: "gatekeeper_go", "Last Rerun State": "PendingGatekeepers", "Go Status": "Go" }, 4).bucket,
  "Not Run",
);

const s = summarize(rows);
assert.equal(s.tests, 3);
assert.equal(s.passed, 1);
assert.equal(s.failed, 1);
assert.equal(s.notRun, 1);
assert.equal(s.executed, 2);
assert.equal(s.progressPct, 66.7);
assert.equal(s.passRatePct, 33.3);
assert.equal(s.byTestline[0].testline, "TL1");
assert.equal(s.failures.length, 1);

const octoberWeeks = getWorkWeeks(new Date("2026-10-08T06:00:00Z"));
assert.equal(octoberWeeks.year, 2026);
assert.equal(octoberWeeks.weeks[0].label, "WW41");
assert.equal(octoberWeeks.weeks[0].from.toISOString(), "2026-10-04T18:30:00.000Z");
assert.equal(octoberWeeks.weeks[0].to.toISOString(), "2026-10-08T06:00:00.000Z");
assert.equal(octoberWeeks.weeks[1].label, "WW40");
assert.equal(octoberWeeks.weeks[1].to.toISOString(), "2026-10-04T18:30:00.000Z");
assert.equal(octoberWeeks.weeks.at(-1).label, "WW01");
const newYearWeeks = getWorkWeeks(new Date("2020-12-31T20:00:00Z"));
assert.equal(newYearWeeks.year, 2020);
assert.equal(newYearWeeks.weeks[0].label, "WW53");

console.log(`OK - ${cases.length} bucket cases + harvest/summarize checks passed`);
