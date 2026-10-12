"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { TeamPlatformCount } from "@/lib/weekly-report-settings";

type EditableTeamPlatformCount = { id: string; team: string; x1: string; x4: string };

const createRowId = () => typeof globalThis.crypto?.randomUUID === "function"
  ? globalThis.crypto.randomUUID()
  : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function UpdateWeeklyReportPage() {
  const [bkc, setBkc] = useState("BKC#40");
  const [teamPlatformCounts, setTeamPlatformCounts] = useState<EditableTeamPlatformCount[]>([]);
  const [hsdesLink, setHsdesLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/update-weekly-report", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          bkc?: string;
          teamPlatformCounts?: TeamPlatformCount[];
          hsdesLink?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Could not load the saved BKC value.");
        if (!cancelled) {
          if (result.bkc) setBkc(result.bkc);
          setTeamPlatformCounts((result.teamPlatformCounts ?? []).map((row) => ({ id: createRowId(), team: row.team, x1: String(row.x1), x4: String(row.x4) })));
          setHsdesLink(result.hsdesLink ?? "");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the saved BKC value.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/update-weekly-report", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bkc,
          teamPlatformCounts: teamPlatformCounts.map((row) => ({ team: row.team, x1: Number(row.x1), x4: Number(row.x4) })),
          hsdesLink,
        }),
      });
      const result = (await response.json()) as {
        bkc?: string;
        teamPlatformCounts?: TeamPlatformCount[];
        hsdesLink?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Could not save the BKC value.");
      setBkc(result.bkc ?? bkc.trim());
      setTeamPlatformCounts((result.teamPlatformCounts ?? []).map((row) => ({ id: createRowId(), team: row.team, x1: String(row.x1), x4: String(row.x4) })));
      setHsdesLink(result.hsdesLink ?? hsdesLink.trim());
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the BKC value.");
    } finally {
      setSaving(false);
    }
  };

  const updateTeam = (index: number, field: keyof EditableTeamPlatformCount, value: string) => {
    setTeamPlatformCounts((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
    setSaved(false);
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-6">
      <h1 className="text-2xl font-semibold text-[var(--text)]">Update Weekly Report</h1>
      <form onSubmit={save} className="mt-6 space-y-6">
        <section className="max-w-3xl">
          <label className="block text-sm font-medium text-[var(--text)]" htmlFor="weekly-report-hsdes-link">HSDES sighting query link</label>
          <input
            id="weekly-report-hsdes-link"
            required
            type="url"
            value={hsdesLink}
            onChange={(event) => { setHsdesLink(event.target.value); setSaved(false); }}
            disabled={loading || saving}
            placeholder="Paste the HSDES General Apps link containing queryId"
            className="mt-2 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">Weekly Report will query Sighting records using Kerberos Negotiate on the report host.</p>
        </section>
        <section className="max-w-xl">
          <label className="block text-sm font-medium text-[var(--text)]" htmlFor="weekly-report-bkc">BKC</label>
          <input
            id="weekly-report-bkc"
            required
            pattern="BKC#(WW)?[0-9]+"
            value={bkc}
            onChange={(event) => { setBkc(event.target.value); setSaved(false); }}
            disabled={loading || saving}
            aria-describedby="weekly-report-bkc-status"
            className="mt-2 h-10 w-56 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
          />
        </section>
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[var(--text)]">DMR X1 and X4 CPU breakdown</h2>
            <button
              type="button"
              disabled={loading || saving || teamPlatformCounts.length >= 20}
              onClick={() => { setTeamPlatformCounts((current) => [...current, { id: createRowId(), team: "", x1: "0", x4: "0" }]); setSaved(false); }}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] disabled:opacity-60"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />Add team
            </button>
          </div>
          <div className="overflow-x-auto border border-[var(--border)]">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-alt)] text-xs font-semibold text-[var(--text-muted)]">
                <tr><th className="px-3 py-2">Team</th><th className="px-3 py-2">X1</th><th className="px-3 py-2">X4</th><th className="w-14 px-3 py-2" /></tr>
              </thead>
              <tbody>
                {teamPlatformCounts.map((row, index) => (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2"><input required maxLength={60} value={row.team} onChange={(event) => updateTeam(index, "team", event.target.value)} aria-label={`Team ${index + 1}`} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                    <td className="px-3 py-2"><input required type="number" min="0" max="1000000" step="1" value={row.x1} onChange={(event) => updateTeam(index, "x1", event.target.value)} aria-label={`${row.team || `Team ${index + 1}`} X1 count`} className="h-9 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                    <td className="px-3 py-2"><input required type="number" min="0" max="1000000" step="1" value={row.x4} onChange={(event) => updateTeam(index, "x4", event.target.value)} aria-label={`${row.team || `Team ${index + 1}`} X4 count`} className="h-9 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                    <td className="px-3 py-2"><button type="button" disabled={loading || saving || teamPlatformCounts.length <= 1} onClick={() => { setTeamPlatformCounts((current) => current.filter((_, rowIndex) => rowIndex !== index)); setSaved(false); }} aria-label={`Remove ${row.team || `team ${index + 1}`}`} title="Remove team" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                  </tr>
                ))}
                {!teamPlatformCounts.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">Loading team counts…</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={loading || saving} className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Saving…" : "Save updates"}
          </button>
        <p id="weekly-report-bkc-status" role="status" className={`min-h-5 text-sm ${error ? "text-red-600" : "text-[var(--text-muted)]"}`}>
          {error || (saved ? "Saved." : "")}
        </p>
        </div>
      </form>
    </main>
  );
}
