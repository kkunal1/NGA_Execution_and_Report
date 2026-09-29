"use client";

import { useEffect, useState } from "react";
import type { PoolSystem } from "@/lib/pool-systems";

export default function PoolSystemsTable() {
  const [systems, setSystems] = useState<PoolSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/pool-systems", { cache: "no-store" });
        const data = (await response.json()) as { systems?: PoolSystem[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load pool systems.");
        if (!cancelled) {
          setSystems(data.systems ?? []);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load pool systems.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">B0 Pool Systems</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Systems currently added to pv_dmr-ap-ap1-b0</p>
        </div>
        <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm font-semibold tabular-nums text-[var(--text-muted)]">
          {systems.length} systems
        </span>
      </div>

      {loading && systems.length === 0 && <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">Loading systems…</p>}
      {error && <p className="px-5 py-10 text-center text-sm text-red-600">{error}</p>}
      {!loading && !error && systems.length === 0 && <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">No systems found.</p>}
      {systems.length > 0 && (
        <div className="max-h-[calc(100vh-12rem)] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-5 py-3 font-semibold">System name</th>
                <th className="px-5 py-3 font-semibold">Config</th>
                <th className="px-5 py-3 font-semibold">Execution status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {systems.map((system) => (
                <tr key={system.id} className="align-top hover:bg-[var(--surface)]">
                  <td className="px-5 py-3 font-medium text-[var(--text)]">{system.name}</td>
                  <td className="max-w-xl px-5 py-3 text-[var(--text-muted)]">{system.config}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${system.executionStatus.toLowerCase().startsWith("run") ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                      {system.executionStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}