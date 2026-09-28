// End-to-end test: serves a mock NGA Testlines page (frozen landing gate, "Condition"
// filter builder with a "GoalName" decoy, Search button, JSON API) and runs the real
// scraper against it through the app's own /api/scrape route.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const MOCK_PORT = 4321;
const APP_PORT = 3123;
const DATA_DIR = ".e2e-data";
const REPORTS_DIR = ".e2e-reports";
const SUITE = "Oak_Stream_Platform_1_DMR-Platform_Beta-PAIV-Platform-AP1_Beta_Regression_Cycle";

const TESTS = [
  { Name: "boot_sanity", "Last Rerun State": "Passed" },
  { Name: "pcie_link", "Last Rerun State": "Passed" },
  { Name: "mem_train", "Last Rerun State": "Passed" },
  { Name: "thermal_soak", "Last Rerun State": "Failed" },
  { Name: "power_cycle", "Last Rerun State": "Infra Error" },
  { Name: "s3_resume", "Last Rerun State": "Not Run" },
].map((t) => ({ ...t, "Testline Name": SUITE }));

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>NGA Mock</title>
<style>
body{font:14px sans-serif;margin:20px}
#gate{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
#gate button{padding:12px 20px;font-size:16px}
#app{display:none}
.row{display:flex;gap:8px;margin:8px 0;align-items:center}
.cb{border:1px solid #888;padding:6px 10px;min-width:160px;cursor:pointer;background:#fff}
#panel{position:absolute;border:1px solid #888;background:#fff;z-index:99;max-height:220px;overflow:auto}
#panel [role=option]{padding:6px 10px;cursor:pointer}
</style></head><body>
<div id="gate"><button id="getLatest">Get Latest Testline</button></div>
<div id="app">
  <h3>Testlines</h3>
  <div class="row">
    <button id="clearAll">Clear All</button>
    <button id="addCond">Condition</button>
    <button id="search">Search</button>
    <select id="pageSize"><option>25</option><option>100</option><option>500</option><option>1000</option></select>
  </div>
  <div id="conditions"></div>
  <table id="grid"><thead><tr><th>Name</th><th>Testline Name</th><th>Last Rerun State</th></tr></thead><tbody></tbody></table>
</div>
<div id="panel" style="display:none" role="listbox"></div>
<script>
const OPTIONS = {
  Entity: ["Goal", "TestLine", "TestCase"],
  // "GoalName" deliberately precedes "Name" to catch substring matching.
  Field: ["GoalName", "Name", "Suite", "NameSpace", "Owner"],
  Operator: ["Not Equal", "Equal", "In", "Contains"]
};
const panel = document.getElementById('panel');
let active = null;

function openPanel(cb) {
  active = cb;
  const kind = cb.getAttribute('aria-label');
  render(OPTIONS[kind], '');
  const r = cb.getBoundingClientRect();
  panel.style.left = r.left + 'px';
  panel.style.top = (r.bottom + window.scrollY) + 'px';
  panel.style.display = 'block';
}
function render(list, q) {
  panel.innerHTML = '';
  list.filter(o => o.toLowerCase().includes(q.toLowerCase())).forEach(o => {
    const d = document.createElement('div');
    d.setAttribute('role', 'option');
    // Real widgets wrap options in icons + highlight markup, which breaks :text-is().
    const hit = q ? o.replace(new RegExp(q, 'i'), m => '<b>' + m + '</b>') : o;
    d.innerHTML = '\\n  <i class="material-icons" aria-hidden="true">check_box_outline_blank</i>\\n  <span class="lbl">' + hit + '</span>\\n  <span class="hint" aria-hidden="true">field</span>\\n';
    d.onclick = () => { active.textContent = o; panel.style.display = 'none'; active = null; };
    panel.appendChild(d);
  });
}
let typed = '';
document.addEventListener('keydown', e => {
  if (panel.style.display === 'none' || !active) return;
  if (e.key === 'Escape') { panel.style.display = 'none'; active = null; typed = ''; return; }
  if (e.key === 'Backspace' || e.key === 'Delete') typed = '';
  else if (e.key.length === 1) typed += e.key;
  render(OPTIONS[active.getAttribute('aria-label')], typed);
});

function addCondition() {
  const row = document.createElement('div');
  row.className = 'row cond';
  ['Entity', 'Field', 'Operator'].forEach(kind => {
    const cb = document.createElement('div');
    cb.className = 'cb';
    cb.setAttribute('role', 'combobox');
    cb.setAttribute('aria-label', kind);
    cb.tabIndex = 0;
    cb.textContent = '';
    cb.onclick = () => { typed = ''; openPanel(cb); };
    row.appendChild(cb);
  });
  const val = document.createElement('input');
  val.placeholder = 'Value';
  row.appendChild(val);
  document.getElementById('conditions').appendChild(row);
}

document.getElementById('getLatest').onclick = () => {
  document.getElementById('gate').remove();
  document.getElementById('app').style.display = 'block';
  // Landing state starts with a stale, pre-filled condition row.
  addCondition();
  const row = document.querySelector('.cond');
  row.children[0].textContent = 'Goal';
  row.children[1].textContent = 'GoalName';
  row.children[2].textContent = 'Contains';
  row.children[3].value = 'stale-value';
};
document.getElementById('clearAll').onclick = () => { document.getElementById('conditions').innerHTML = ''; };
document.getElementById('addCond').onclick = addCondition;

document.getElementById('search').onclick = async () => {
  const row = document.querySelector('.cond');
  if (!row) return;
  const [entity, field, operator] = [0, 1, 2].map(i => row.children[i].textContent.trim());
  const value = row.children[3].value.trim();
  const q = new URLSearchParams({ entity, field, operator, value });
  const res = await fetch('/api/testlines?' + q.toString());
  const data = await res.json();
  const body = document.querySelector('#grid tbody');
  body.innerHTML = '';
  data.items.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + r.Name + '</td><td>' + r['Testline Name'] + '</td><td>' + r['Last Rerun State'] + '</td>';
    body.appendChild(tr);
  });
};
</script></body></html>`;

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
  if (url.pathname === "/api/testlines") {
    const p = url.searchParams;
    // Only the exact expected condition returns data.
    const ok =
      p.get("entity") === "TestLine" &&
      p.get("field") === "Suite" &&
      p.get("operator") === "Equal" &&
      p.get("value") === SUITE;
    const items = ok ? TESTS : [];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ total: items.length, items }));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
});

const app = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)],
  {
    env: {
      ...process.env,
      NGA_URL: `http://localhost:${MOCK_PORT}/`,
      NGA_HEADLESS: "true",
      NGA_BROWSER_CHANNEL: "chrome",
      NGA_PROFILE_DIR: ".e2e-profile",
      NGA_SETTLE_MS: "700",
      NGA_NAV_TIMEOUT_MS: "30000",
      NGA_SUITE_NAME: SUITE,
      NGA_DATA_DIR: DATA_DIR,
      NGA_REPORTS_DIR: REPORTS_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let appLog = "";
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));

const waitForApp = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${APP_PORT}/api/runs`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`app did not start:\n${appLog}`);
};

const cleanup = async () => {
  app.stdout.destroy();
  app.stderr.destroy();
  app.kill();
  mock.closeAllConnections?.();
  await new Promise((r) => mock.close(r));
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.rm(REPORTS_DIR, { recursive: true, force: true });
  await fs.rm(".e2e-profile", { recursive: true, force: true });
};

try {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await new Promise((r) => mock.listen(MOCK_PORT, r));
  await waitForApp();

  const res = await fetch(`http://localhost:${APP_PORT}/api/scrape`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ headless: true }),
    signal: AbortSignal.timeout(300_000),
  });
  const run = await res.json();
  assert.ok(res.ok, `scrape failed: ${JSON.stringify(run)}`);

  console.log("condition read back:", run.meta.appliedCondition);
  console.log("warnings:", run.meta.warnings);

  assert.deepEqual(
    run.meta.appliedCondition,
    ["TestLine", "Suite", "Equal"],
    "filter row must be TestLine / Suite / Equal",
  );
  assert.equal(run.meta.filterVerified, true, "filter must verify");
  assert.equal(run.meta.gridUnlocked, true, "Get Latest Testline must be clicked");
  assert.equal(run.summary.tests, 6, "test count");
  assert.equal(run.summary.passed, 3, "passed");
  assert.equal(run.summary.failed, 1, "failed");
  assert.equal(run.summary.blocked, 1, "blocked (Infra Error)");
  assert.equal(run.summary.notRun, 1, "not run");
  assert.equal(run.summary.executed, 5, "executed");

  const traversal = await fetch(
    `http://localhost:${APP_PORT}/api/runs?runId=..%2F..%2Fpackage`,
  );
  assert.equal((await traversal.json()).run, null, "path traversal must be blocked");

  const report = await fetch(`http://localhost:${APP_PORT}/api/report`);
  const html = await report.text();
  assert.ok(report.ok && html.includes("Filter verified"), "HTML report must render");

  console.log("E2E OK - unlock, Condition, exact field select, Search, counts, report");
  await cleanup();
  process.exitCode = 0;
} catch (err) {
  console.error("E2E FAILED:", err.message);
  console.error(appLog.slice(-2000));
  await cleanup();
  process.exitCode = 1;
}
