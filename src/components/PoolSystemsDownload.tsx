"use client";

import { useState } from "react";
import { Download as DownloadIcon } from "lucide-react";
import type { PoolSystem, UncoveredConfig } from "@/lib/pool-systems";
import { isRunning, splitConfig } from "./PoolSystemsTable";

const esc = (value: string | number) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const isFlagged = (value: string) => Boolean(value) && value.toLowerCase() !== "execution";

function buildHtml(systems: PoolSystem[], configs: UncoveredConfig[]) {
  const groups = new Map<string, PoolSystem[]>();
  for (const system of systems) {
    const { base } = splitConfig(system.config);
    groups.set(base, [...(groups.get(base) ?? []), system]);
  }
  const running = systems.filter((s) => isRunning(s.executionStatus)).length;

  const systemRows = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([base, list]) =>
      list
        .map((s, i) => {
          const run = isRunning(s.executionStatus);
          const variant = splitConfig(s.config).variant;
          return `<tr class="${i === 0 ? "group" : ""}">
            ${i === 0 ? `<td rowspan="${list.length}" class="cfg"><b>${esc(base)}</b><div class="muted">${list.length} ${list.length === 1 ? "system" : "systems"}</div></td>` : ""}
            <td><b>${esc(s.name)}</b>${variant ? ` <span class="tag">${esc(variant)}</span>` : ""}</td>
            <td><span class="badge ${run ? "run" : "idle"}" title="${esc(s.executionStatus)}">${run ? "Running" : "Idle"}</span></td>
            <td class="${!run && isFlagged(s.activity) ? "warn" : "muted"}">${esc(s.activity || "—")}</td>
            <td class="notes ${isFlagged(s.notes) ? "warn" : "muted"}">${esc(s.notes || "—")}</td>
          </tr>`;
        })
        .join(""),
    )
    .join("");

  const totals = configs.reduce((t, r) => ({ n: t.n + r.testLines, p1: t.p1 + r.p1, p2: t.p2 + r.p2 }), { n: 0, p1: 0, p2: 0 });
  const configRows = configs
    .map(
      (r) => `<tr>
        <td><b>${esc(r.config)}</b></td>
        <td>${r.domains.map((d) => `${esc(d.domain)}${r.domains.length > 1 ? ` <span class="muted">(${d.testLines})</span>` : ""}`).join("<br>")}</td>
        <td>${r.testLines}</td><td>${r.p1}</td><td>${r.p2}</td>
        <td><span class="badge none">No System Assigned</span></td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>B0 Pool Systems</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#0f172a;background:#f8fafc}
h1,h2{margin:0 0 4px}.sub{color:#64748b;margin:0 0 12px;font-size:13px}
section{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#eef2ff;color:#312e81;text-align:left;padding:8px;text-transform:uppercase;font-size:11px}
td{padding:6px 8px;border-top:1px solid #e2e8f0;vertical-align:middle}
tr.group td{border-top:2px solid #cbd5e1}td.cfg{background:#f8fafc;border-right:1px solid #e2e8f0;vertical-align:top}
.muted{color:#64748b}.warn{color:#d97706;font-weight:600}.notes{white-space:pre-wrap;max-width:320px}
.tag{background:#f1f5f9;color:#64748b;border-radius:4px;padding:1px 6px;font-size:11px}
.badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600}
.run{background:#dcfce7;color:#15803d}.idle{background:#f1f5f9;color:#475569}.none{background:#fee2e2;color:#b91c1c}
.pills span{display:inline-block;margin-right:6px}tfoot td{font-weight:700;border-top:2px solid #cbd5e1}
</style></head><body>
<p class="sub">Generated ${esc(new Date().toLocaleString())}</p>
<section>
  <h1>B0 Pool Systems</h1>
  <p class="sub">Systems currently added to pv_dmr-ap-ap1-b0</p>
  <p class="pills"><span class="badge idle">${groups.size} configs</span><span class="badge idle">${systems.length} systems</span><span class="badge run">${running} running</span><span class="badge idle">${systems.length - running} idle</span></p>
  <table><thead><tr><th>Configuration</th><th>Systems</th><th>Execution status</th><th>Activity</th><th>Notes</th></tr></thead>
  <tbody>${systemRows || '<tr><td colspan="5" class="muted">No systems found.</td></tr>'}</tbody></table>
</section>
<section>
  <h2>Configs Without Systems</h2>
  <p class="sub">B0 P1 + P2 test line configs with no primary or secondary system in pv_dmr-ap-ap1-b0</p>
  <table><thead><tr><th>Configuration</th><th>Domain</th><th>Test count</th><th>P1</th><th>P2</th><th>System</th></tr></thead>
  <tbody>${configRows || '<tr><td colspan="6" class="muted">Every config has at least one system assigned.</td></tr>'}</tbody>
  ${configs.length ? `<tfoot><tr><td>Total</td><td></td><td>${totals.n}</td><td>${totals.p1}</td><td>${totals.p2}</td><td></td></tr></tfoot>` : ""}</table>
</section>
</body></html>`;
}

export default function PoolSystemsDownload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const [systemsRes, configsRes] = await Promise.all([
        fetch("/api/pool-systems", { cache: "no-store" }),
        fetch("/api/pool-systems/uncovered-configs", { cache: "no-store" }),
      ]);
      const systemsData = (await systemsRes.json()) as { systems?: PoolSystem[]; error?: string };
      const configsData = (await configsRes.json()) as { configs?: UncoveredConfig[]; error?: string };
      if (!systemsRes.ok) throw new Error(systemsData.error ?? "Could not load pool systems.");
      if (!configsRes.ok) throw new Error(configsData.error ?? "Could not load config coverage.");

      const blob = new Blob([buildHtml(systemsData.systems ?? [], configsData.configs ?? [])], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = `B0_Pool_Systems_${stamp}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download page.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex items-center justify-end gap-3">
      {error && <span className="text-sm text-red-600">{error}</span>}
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] shadow-sm transition hover:opacity-80 disabled:opacity-50"
      >
        <DownloadIcon className="h-3.5 w-3.5" />
        {busy ? "Preparing…" : "Download HTML"}
      </button>
    </div>
  );
}
