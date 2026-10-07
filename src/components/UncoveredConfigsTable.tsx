"use client";

import { useEffect, useState } from "react";
import type { UncoveredConfig } from "@/lib/pool-systems";

// "16026244698-Oak_Stream_Platform_1_DMR-PD013-408" -> "PD013-408"
export const shortConfig = (name: string) => name.replace(/^.*?(DMR-)/, "$1").replace(/^DMR-(?=PD\d)/, "");

export default function UncoveredConfigsTable() {
  const [configs, setConfigs] = useState<UncoveredConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/pool-systems/uncovered-configs", { cache: "no-store" });
        const data = (await response.json()) as { configs?: UncoveredConfig[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load config coverage.");
        if (!cancelled) {
          setConfigs(data.configs ?? []);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load config coverage.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const totals = configs.reduce(
    (sum, row) => ({ testLines: sum.testLines + row.testLines, p1: sum.p1 + row.p1, p2: sum.p2 + row.p2 }),
    { testLines: 0, p1: 0, p2: 0 },
  );

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Configs Without Systems</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            B0 P1 + P2 test line configs with no primary or secondary system in pv_dmr-ap-ap1-b0
          </p>
        </div>
        <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold tabular-nums text-red-700">
          {configs.length} configs
        </span>
      </div>

      {loading && configs.length === 0 && <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">Loading configs…</p>}
      {error && <p className="px-5 py-10 text-center text-sm text-red-600">{error}</p>}
      {!loading && !error && configs.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">Every config has at least one system assigned.</p>
      )}
      {configs.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-5 py-3 font-semibold">Configuration</th>
                <th className="px-5 py-3 font-semibold">Domain</th>
                <th className="px-5 py-3 font-semibold">Test count</th>
                <th className="px-5 py-3 font-semibold">P1</th>
                <th className="px-5 py-3 font-semibold">P2</th>
                <th className="px-5 py-3 font-semibold">System</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((row) => (
                <tr key={row.config} className="border-t border-[var(--border)] hover:bg-[var(--surface)]">
                  <td className="px-5 py-2 font-medium text-[var(--text)]" title={row.config}>{shortConfig(row.config)}</td>
                  <td className="px-5 py-2">
                    <div className="flex flex-col gap-0.5">
                      {(row.domains ?? []).map((d) => (
                        <span key={d.domain} className="text-[var(--text)]">
                          {d.domain}
                          {row.domains.length > 1 && <span className="ml-1 text-xs text-[var(--text-muted)]">({d.testLines})</span>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-2 tabular-nums text-[var(--text)]">{row.testLines}</td>
                  <td className="px-5 py-2 tabular-nums text-[var(--text-muted)]">{row.p1}</td>
                  <td className="px-5 py-2 tabular-nums text-[var(--text-muted)]">{row.p2}</td>
                  <td className="px-5 py-2">
                    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">No System Assigned</span>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--border)] bg-[var(--surface)] font-semibold text-[var(--text)]">
                <td className="px-5 py-2">Total</td>
                <td className="px-5 py-2" />
                <td className="px-5 py-2 tabular-nums">{totals.testLines}</td>
                <td className="px-5 py-2 tabular-nums">{totals.p1}</td>
                <td className="px-5 py-2 tabular-nums">{totals.p2}</td>
                <td className="px-5 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
