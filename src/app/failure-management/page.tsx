"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Loader2, Search, ShieldCheck } from "lucide-react";
import { formatValidationGroupName } from "@/lib/normalize";
import type { FailureEntry, FailureSearchResult } from "@/lib/failure-management";

const STATUS: Record<FailureEntry["status"], { label: string; style: string }> = {
  added: { label: "Added", style: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  "not-added": { label: "Not added", style: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  "not-verified": { label: "Not verified", style: "bg-[var(--surface-alt)] text-[var(--text-muted)]" },
  "no-hsd": { label: "No HSD in bucket", style: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
};

const articleUrl = (id: string) => `https://hsdes.intel.com/appstore/article/#/${id}`;

export default function FailureManagementPage() {
  const [domains, setDomains] = useState<string[]>([]);
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<FailureSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/failure-management", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as FailureSearchResult & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load domains.");
        setDomains(data.domains);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load domains.");
      });
    return () => controller.abort();
  }, []);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!domain || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/failure-management?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
      const data = await response.json() as FailureSearchResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Search failed.");
      setResult(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-[1600px] text-[var(--text)]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Failure Management</h1>
        <span className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Read-only</span>
      </header>

      <form onSubmit={search} className="mb-6 flex flex-wrap items-end gap-3 border-y border-[var(--border)] py-4">
        <label className="flex w-full flex-col gap-2 text-sm font-medium sm:w-72">
          Domain
          <select value={domain} onChange={(event) => { setDomain(event.target.value); setResult(null); }} disabled={loading} className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
            <option value="">Select domain</option>
            {domains.map((value) => <option key={value} value={value}>{formatValidationGroupName(value)}</option>)}
          </select>
        </label>
        <button type="submit" disabled={!domain || loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}Search
        </button>
      </form>

      {error && <p role="alert" className="mb-4 text-sm text-red-500">{error}</p>}
      {loading && <p role="status" className="py-10 text-center text-sm text-[var(--text-muted)]">Checking PVIM link status...</p>}
      {!loading && !result && !error && <p className="py-12 text-center text-sm text-[var(--text-muted)]">No search results.</p>}
      {result && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-y-4 border-b border-[var(--border)] pb-5 sm:grid-cols-5" aria-live="polite">
            <div><p className="text-xs text-[var(--text-muted)]">Failed tests</p><p className="mt-1 text-2xl font-semibold tabular-nums">{result.rows.length}</p></div>
            {(Object.keys(STATUS) as FailureEntry["status"][]).map((status) => (
              <div key={status}><p className="text-xs text-[var(--text-muted)]">{STATUS[status].label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{result.rows.filter((row) => row.status === status).length}</p></div>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{formatValidationGroupName(result.domain)} failures</h2>
            <p className="text-xs text-[var(--text-muted)]">Execution snapshot: {result.capturedAt ? new Date(result.capturedAt).toLocaleString() : "Unavailable"}</p>
          </div>
          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-alt)] text-xs text-[var(--text-muted)]"><tr>{["Failed test / Suite", "NGA bucket", "HSD", "PVIM Test Result", "bug_id status"].map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={`${row.id}-${index}`} className="border-t border-[var(--border)] align-top even:bg-[var(--surface-alt)]">
                    <td className="max-w-[360px] px-4 py-4"><a href={`https://nga.laas.intel.com/#/dmr_pv/planning/testResult/${encodeURIComponent(row.id)}`} target="_blank" rel="noopener noreferrer" className="break-words font-medium text-[var(--accent)] hover:underline">{row.testline}</a><p className="mt-2 break-words text-xs text-[var(--text-muted)]">{row.suite}</p></td>
                    <td className="max-w-56 break-words px-4 py-4 text-xs">{row.bucketName || "-"}</td>
                    <td className="px-4 py-4">{row.hsdIds.length ? row.hsdIds.map((id) => <a key={id} href={articleUrl(id)} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-1 whitespace-nowrap text-[var(--accent)] hover:underline">{id}<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>) : "-"}</td>
                    <td className="px-4 py-4">{row.pvimId ? <a href={articleUrl(row.pvimId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--accent)] hover:underline">{row.pvimId}<ExternalLink className="h-3 w-3" aria-hidden="true" /></a> : "Unavailable"}</td>
                    <td className="max-w-72 px-4 py-4"><span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${STATUS[row.status].style}`}>{STATUS[row.status].label}</span><p className="mt-2 text-xs text-[var(--text-muted)]">{row.detail}</p>{row.linkedIds.length > 0 && <p className="mt-1 break-words text-xs text-[var(--text-muted)]">Existing bug IDs: {row.linkedIds.join(", ")}</p>}</td>
                  </tr>
                ))}
                {!result.rows.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-[var(--text-muted)]">No failed tests in this domain.</td></tr>}
              </tbody>
            </table>
          </div>
          {result.checkedAt && <p className="mt-3 text-xs text-[var(--text-muted)]">Status checked: {new Date(result.checkedAt).toLocaleString()}</p>}
        </>
      )}
    </section>
  );
}