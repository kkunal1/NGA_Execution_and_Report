"use client";

import { useEffect, useState } from "react";
import type { UncoveredConfig } from "@/lib/pool-systems";
import type { ConfigCoverageMapping } from "@/lib/config-coverage-settings";

export default function UncoveredConfigsTable({ selectedPoolNames }: { selectedPoolNames: string[] }) {
  const [configs, setConfigs] = useState<UncoveredConfig[]>([]);
  const [mappings, setMappings] = useState<ConfigCoverageMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poolNames, setPoolNames] = useState<string[]>([]);
  const [unmappedPoolNames, setUnmappedPoolNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedPoolNames.length) {
        setConfigs([]);
        setMappings([]);
        setPoolNames([]);
        setUnmappedPoolNames([]);
        setLoading(false);
        return;
      }
      setConfigs([]);
      setMappings([]);
      setPoolNames([]);
      setUnmappedPoolNames([]);
      setError(null);
      setLoading(true);
      try {
        const query = new URLSearchParams();
        selectedPoolNames.forEach((poolName) => query.append("poolName", poolName));
        const response = await fetch(`/api/pool-systems/uncovered-configs?${query}`, { cache: "no-store" });
        const data = (await response.json()) as { configs?: UncoveredConfig[]; mappings?: ConfigCoverageMapping[]; poolNames?: string[]; unmappedPoolNames?: string[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load config coverage.");
        if (!cancelled) {
          setConfigs(data.configs ?? []);
          setMappings(data.mappings ?? []);
          setPoolNames(data.poolNames ?? []);
          setUnmappedPoolNames(data.unmappedPoolNames ?? []);
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
  }, [selectedPoolNames]);

  const totalTests = configs.reduce((total, row) => total + row.testLines, 0);

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Configs Without Systems</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Configs without primary or current secondary systems in {poolNames.join(", ") || "selected pools"}
          </p>
        </div>
        <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold tabular-nums text-red-700">
          {configs.length} configs
        </span>
      </div>

      {loading && configs.length === 0 && <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">Loading configs…</p>}
      {error && <p className="px-5 py-10 text-center text-sm text-red-600">{error}</p>}
      {!loading && !error && selectedPoolNames.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">Select a pool above to see its configs without systems.</p>
      )}
      {!loading && !error && unmappedPoolNames.length > 0 && (
        <p className="px-5 py-4 text-sm text-amber-700">No suite mapping configured for: {unmappedPoolNames.join(", ")}</p>
      )}
      {!loading && !error && selectedPoolNames.length > 0 && mappings.length === 0 && unmappedPoolNames.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">No coverage mappings match the selected pools.</p>
      )}
      {!loading && !error && mappings.length > 0 && configs.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">Every mapped config has a system assigned in its pool.</p>
      )}
      {configs.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-5 py-3 font-semibold">Configuration</th>
                <th className="px-5 py-3 font-semibold">Domain</th>
                <th className="px-5 py-3 font-semibold">Total Tests</th>
                <th className="px-5 py-3 font-semibold">System</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((row) => (
                <tr key={row.config} className="border-t border-[var(--border)] hover:bg-[var(--surface)]">
                  <td className="px-5 py-2 font-medium text-[var(--text)]">{row.config}</td>
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
                  <td className="px-5 py-2">
                    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">No System Assigned</span>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--border)] bg-[var(--surface)] font-semibold text-[var(--text)]">
                <td className="px-5 py-2">Total</td>
                <td className="px-5 py-2" />
                <td className="px-5 py-2 tabular-nums">{totalTests}</td>
                <td className="px-5 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
