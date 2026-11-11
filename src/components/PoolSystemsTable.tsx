"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PoolSystem } from "@/lib/pool-systems";

export const isRunning = (status: string) => status.toLowerCase().startsWith("run");

const filterInputClass =
  "w-full min-w-[7rem] rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-indigo-400";

// "...DMR-PD013-611_Windows" -> base "...DMR-PD013-611", variant "Windows".
export function splitConfig(config: string) {
  const match = config.match(/^(.*-PD\d+-\d+)_(.+)$/i);
  return match ? { base: match[1], variant: match[2] } : { base: config, variant: "" };
}

export default function PoolSystemsTable({ onSelectedPoolNamesChange }: { onSelectedPoolNamesChange?: (poolNames: string[]) => void }) {
  const [systems, setSystems] = useState<PoolSystem[]>([]);
  const [poolNames, setPoolNames] = useState<string[]>([]);
  const [selectedPoolNames, setSelectedPoolNames] = useState<string[]>([]);
  const configuredPoolNames = useRef<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configFilter, setConfigFilter] = useState("");
  const [systemFilter, setSystemFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [notesFilter, setNotesFilter] = useState("");
  const hasFilters = Boolean(configFilter || systemFilter || statusFilter || activityFilter || notesFilter)
    || (poolNames.length > 0 && selectedPoolNames.length !== poolNames.length);

  const activityOptions = useMemo(
    () => [...new Set(systems.map((system) => system.activity || "—"))].sort((a, b) => a.localeCompare(b)),
    [systems],
  );

  const filteredSystems = useMemo(() => {
    const has = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase());
    return systems.filter((system) => {
      const { base, variant } = splitConfig(system.config);
      if (configFilter && !has(base, configFilter)) return false;
      if (systemFilter && !has(`${system.name} ${variant}`, systemFilter)) return false;
      if (statusFilter && (isRunning(system.executionStatus) ? "Running" : "Idle") !== statusFilter) return false;
      if (activityFilter && (system.activity || "—") !== activityFilter) return false;
      if (notesFilter && !has(system.notes, notesFilter)) return false;
      return true;
    });
  }, [systems, configFilter, systemFilter, statusFilter, activityFilter, notesFilter]);

  const clearFilters = () => {
    setConfigFilter("");
    setSystemFilter("");
    setStatusFilter("");
    setActivityFilter("");
    setNotesFilter("");
    setSelectedPoolNames(poolNames);
  };

  const configGroups = useMemo(() => {
    const groups = new Map<string, PoolSystem[]>();
    for (const system of filteredSystems) {
      const { base } = splitConfig(system.config);
      const list = groups.get(base);
      if (list) list.push(system);
      else groups.set(base, [system]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredSystems]);
  const runningCount = filteredSystems.filter((system) => isRunning(system.executionStatus)).length;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const query = new URLSearchParams();
        if (configuredPoolNames.current.length) {
          query.set("filterPools", "1");
          selectedPoolNames.forEach((poolName) => query.append("poolName", poolName));
        }
        const response = await fetch(`/api/pool-systems${query.size ? `?${query}` : ""}`, { cache: "no-store" });
        const data = (await response.json()) as { systems?: PoolSystem[]; poolNames?: string[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load pool systems.");
        if (!cancelled) {
          const nextPoolNames = data.poolNames ?? [];
          const previousNames = new Set(configuredPoolNames.current.map((name) => name.toLowerCase()));
          setSelectedPoolNames((current) => {
            const selected = new Set(current.map((name) => name.toLowerCase()));
            const next = nextPoolNames.filter((name) => selected.has(name.toLowerCase()) || !previousNames.has(name.toLowerCase()));
            return next.length === current.length && next.every((name, index) => name === current[index]) ? current : next;
          });
          configuredPoolNames.current = nextPoolNames;
          setSystems(data.systems ?? []);
          setPoolNames(nextPoolNames);
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
  }, [selectedPoolNames]);

  useEffect(() => {
    onSelectedPoolNamesChange?.(selectedPoolNames);
  }, [onSelectedPoolNamesChange, selectedPoolNames]);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">All Execution Systems</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Configured pools: {poolNames.length ? poolNames.join(", ") : "none"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold tabular-nums">
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text)] transition hover:opacity-80"
            >
              Clear filters
            </button>
          )}
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-[var(--text-muted)]">{configGroups.length} configs</span>
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-[var(--text-muted)]">
            {hasFilters ? `${filteredSystems.length} of ${systems.length}` : systems.length} systems
          </span>
          <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">{runningCount} running</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{filteredSystems.length - runningCount} idle</span>
        </div>
      </div>

      {poolNames.length > 0 && (
        <fieldset className="mx-5 my-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <legend className="sr-only">Show systems from pools</legend>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Show systems from pools</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Select one or more configured pools to filter the inventory.</p>
            </div>
            <span className="shrink-0 pt-1 text-xs tabular-nums text-[var(--text-muted)]">{selectedPoolNames.length} / {poolNames.length} selected</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {poolNames.map((poolName) => (
              <label key={poolName.toLowerCase()} className="inline-flex min-h-10 max-w-full cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-xs text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={selectedPoolNames.some((name) => name.toLowerCase() === poolName.toLowerCase())}
                  onChange={(event) => setSelectedPoolNames((current) => event.target.checked
                    ? [...current, poolName]
                    : current.filter((name) => name.toLowerCase() !== poolName.toLowerCase()))}
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="break-all">{poolName}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {loading && systems.length === 0 && <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">Loading systems…</p>}
      {error && <p className="px-5 py-10 text-center text-sm text-red-600">{error}</p>}
      {!loading && !error && systems.length === 0 && <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">{selectedPoolNames.length ? "No systems found in the selected pools." : "Select at least one pool to show systems."}</p>}
      {systems.length > 0 && (
        <div className="max-h-[calc(100vh-12rem)] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-5 py-3 font-semibold">Configuration</th>
                <th className="px-5 py-3 font-semibold">Systems</th>
                <th className="px-5 py-3 font-semibold">Execution status</th>
                <th className="px-5 py-3 font-semibold">Activity</th>
                <th className="px-5 py-3 font-semibold">Notes</th>
              </tr>
              <tr className="normal-case tracking-normal">
                <th className="px-5 pb-3 font-normal">
                  <input value={configFilter} onChange={(e) => setConfigFilter(e.target.value)} placeholder="Filter config" aria-label="Filter configuration" className={filterInputClass} />
                </th>
                <th className="px-5 pb-3 font-normal">
                  <input value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)} placeholder="Filter system" aria-label="Filter systems" className={filterInputClass} />
                </th>
                <th className="px-5 pb-3 font-normal">
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter execution status" className={filterInputClass}>
                    <option value="">All</option>
                    <option value="Running">Running</option>
                    <option value="Idle">Idle</option>
                  </select>
                </th>
                <th className="px-5 pb-3 font-normal">
                  <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)} aria-label="Filter activity" className={filterInputClass}>
                    <option value="">All</option>
                    {activityOptions.map((activity) => (
                      <option key={activity} value={activity}>{activity}</option>
                    ))}
                  </select>
                </th>
                <th className="px-5 pb-3 font-normal">
                  <input value={notesFilter} onChange={(e) => setNotesFilter(e.target.value)} placeholder="Filter notes" aria-label="Filter notes" className={filterInputClass} />
                </th>
              </tr>
            </thead>
            <tbody>
              {configGroups.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">No systems match the filters.</td>
                </tr>
              )}
              {configGroups.map(([configName, groupSystems]) =>
                groupSystems.map((system, index) => (
                  <tr
                    key={system.id}
                    className={`align-middle hover:bg-[var(--surface)] ${index === 0 ? "border-t-2 border-[var(--border)]" : "border-t border-[var(--border)]"}`}
                  >
                    {index === 0 && (
                      <td rowSpan={groupSystems.length} className="max-w-md border-r border-[var(--border)] bg-[var(--surface)] px-5 py-3 align-top">
                        <div className="font-medium text-[var(--text)]">{configName}</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          {groupSystems.length} {groupSystems.length === 1 ? "system" : "systems"}
                        </div>
                      </td>
                    )}
                    <td className="px-5 py-2 font-medium text-[var(--text)]">
                      {system.name}
                      {splitConfig(system.config).variant && (
                        <span className="ml-2 rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs font-normal text-[var(--text-muted)]">
                          {splitConfig(system.config).variant}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2">
                      <span
                        title={system.executionStatus}
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isRunning(system.executionStatus) ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {isRunning(system.executionStatus) ? "Running" : "Idle"}
                      </span>
                    </td>
                    <td className={`px-5 py-2 ${!isRunning(system.executionStatus) && system.activity && system.activity.toLowerCase() !== "execution" ? "font-medium text-amber-600" : "text-[var(--text-muted)]"}`}>
                      {system.activity || "—"}
                    </td>
                    <td className={`max-w-xs whitespace-pre-wrap break-words px-5 py-2 ${system.notes && system.notes.toLowerCase() !== "execution" ? "font-medium text-amber-600" : "text-[var(--text-muted)]"}`}>
                      {system.notes || "—"}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}