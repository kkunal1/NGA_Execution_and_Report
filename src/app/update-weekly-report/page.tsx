"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import type { TeamPlatformCount, WeeklyReportLink } from "@/lib/weekly-report-settings";

type EditableTeamPlatformCount = { id: string; team: string; x1: string; x4: string; extraCounts: string[] };
type EditableCpuColumn = { id: string; label: string };
type EditableWeeklyReportLink = { id: string; label: string; url: string };

const createRowId = () => typeof globalThis.crypto?.randomUUID === "function"
  ? globalThis.crypto.randomUUID()
  : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function UpdateWeeklyReportPage() {
  const [bkc, setBkc] = useState("BKC#40");
  const [teamPlatformCounts, setTeamPlatformCounts] = useState<EditableTeamPlatformCount[]>([]);
  const [cpuColumns, setCpuColumns] = useState<EditableCpuColumn[]>([]);
  const [cpuBreakdownTitle, setCpuBreakdownTitle] = useState("DMR X1 and X4 CPU breakdown");
  const [cpuTitleEditing, setCpuTitleEditing] = useState(false);
  const [hsdesLink, setHsdesLink] = useState("");
  const [links, setLinks] = useState<EditableWeeklyReportLink[]>([]);
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
          cpuColumns?: string[];
          cpuBreakdownTitle?: string;
          hsdesLink?: string;
          links?: WeeklyReportLink[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Could not load the saved BKC value.");
        if (!cancelled) {
          if (result.bkc) setBkc(result.bkc);
          setCpuColumns((result.cpuColumns ?? []).map((label) => ({ id: createRowId(), label })));
          setCpuBreakdownTitle(result.cpuBreakdownTitle ?? "DMR X1 and X4 CPU breakdown");
          setTeamPlatformCounts((result.teamPlatformCounts ?? []).map((row) => ({ id: createRowId(), team: row.team, x1: String(row.x1), x4: String(row.x4), extraCounts: (row.extraCounts ?? []).map(String) })));
          setHsdesLink(result.hsdesLink ?? "");
          setLinks((result.links ?? []).map((link) => ({ ...link, id: createRowId() })));
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
          teamPlatformCounts: teamPlatformCounts.map((row) => ({ team: row.team, x1: Number(row.x1), x4: Number(row.x4), extraCounts: row.extraCounts.map(Number) })),
          cpuColumns: cpuColumns.map((column) => column.label),
          cpuBreakdownTitle,
          hsdesLink,
          links: links.map((link) => ({ label: link.label, url: link.url })),
        }),
      });
      const result = (await response.json()) as {
        bkc?: string;
        teamPlatformCounts?: TeamPlatformCount[];
        cpuColumns?: string[];
        cpuBreakdownTitle?: string;
        hsdesLink?: string;
        links?: WeeklyReportLink[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Could not save the BKC value.");
      setBkc(result.bkc ?? bkc.trim());
      setCpuColumns((result.cpuColumns ?? []).map((label) => ({ id: createRowId(), label })));
      setCpuBreakdownTitle(result.cpuBreakdownTitle ?? cpuBreakdownTitle.trim());
      setCpuTitleEditing(false);
      setTeamPlatformCounts((result.teamPlatformCounts ?? []).map((row) => ({ id: createRowId(), team: row.team, x1: String(row.x1), x4: String(row.x4), extraCounts: (row.extraCounts ?? []).map(String) })));
      setHsdesLink(result.hsdesLink ?? hsdesLink.trim());
      setLinks((result.links ?? []).map((link) => ({ ...link, id: createRowId() })));
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

  const updateExtraCount = (rowIndex: number, columnIndex: number, value: string) => {
    setTeamPlatformCounts((current) => current.map((row, index) => index === rowIndex
      ? { ...row, extraCounts: row.extraCounts.map((count, extraIndex) => extraIndex === columnIndex ? value : count) }
      : row));
    setSaved(false);
  };

  const updateLink = (index: number, field: keyof EditableWeeklyReportLink, value: string) => {
    setLinks((current) => current.map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link));
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
        <section className="space-y-5 border-t border-[var(--border)] pt-5">
          <h2 className="text-base font-semibold text-[var(--text)]">Execution Summary Section</h2>
          <label className="block max-w-xl text-sm font-medium text-[var(--text)]" htmlFor="weekly-report-bkc">BKC
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
          </label>
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--text)]">Report Links</h3>
              <button type="button" disabled={loading || saving || links.length >= 20} onClick={() => { setLinks((current) => [...current, { id: createRowId(), label: "", url: "" }]); setSaved(false); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] disabled:opacity-60">
                <Plus className="h-4 w-4" aria-hidden="true" />Add link
              </button>
            </div>
            <div className="overflow-x-auto border border-[var(--border)]">
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                <thead className="bg-[var(--surface-alt)] text-xs font-semibold text-[var(--text-muted)]">
                  <tr><th className="px-3 py-2">Link text</th><th className="px-3 py-2">HTTPS URL</th><th className="w-14 px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {links.map((link, index) => (
                    <tr key={link.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2"><input required maxLength={120} value={link.label} onChange={(event) => { setLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item)); setSaved(false); }} aria-label={`Link ${index + 1} text`} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                      <td className="px-3 py-2"><input required type="url" maxLength={2048} value={link.url} onChange={(event) => { setLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item)); setSaved(false); }} aria-label={`Link ${index + 1} URL`} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                      <td className="px-3 py-2"><button type="button" disabled={loading || saving} onClick={() => { setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index)); setSaved(false); }} aria-label={`Remove link ${index + 1}`} title="Remove link" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                    </tr>
                  ))}
                  {!links.length && <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No report links configured.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {cpuTitleEditing ? (
                <input
                  autoFocus
                  required
                  maxLength={120}
                  aria-label="CPU breakdown title"
                  value={cpuBreakdownTitle}
                  onChange={(event) => { setCpuBreakdownTitle(event.target.value); setSaved(false); }}
                  disabled={loading || saving}
                  className="h-9 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm font-semibold text-[var(--text)]"
                />
              ) : <h2 className="break-words text-base font-semibold text-[var(--text)]">{cpuBreakdownTitle}</h2>}
              <button
                type="button"
                onClick={() => setCpuTitleEditing((current) => !current)}
                disabled={loading || saving || (cpuTitleEditing && !cpuBreakdownTitle.trim())}
                aria-label={cpuTitleEditing ? "Finish editing CPU breakdown title" : "Edit CPU breakdown title"}
                title={cpuTitleEditing ? "Finish editing title" : "Edit title"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--text)] disabled:opacity-50"
              >
                {cpuTitleEditing ? <Check className="h-4 w-4" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={loading || saving || teamPlatformCounts.length >= 20} onClick={() => { setTeamPlatformCounts((current) => [...current, { id: createRowId(), team: "", x1: "0", x4: "0", extraCounts: cpuColumns.map(() => "0") }]); setSaved(false); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] disabled:opacity-60">
                <Plus className="h-4 w-4" aria-hidden="true" />Add row
              </button>
              <button type="button" disabled={loading || saving || cpuColumns.length >= 10} onClick={() => { setCpuColumns((current) => [...current, { id: createRowId(), label: "" }]); setTeamPlatformCounts((current) => current.map((row) => ({ ...row, extraCounts: [...row.extraCounts, "0"] }))); setSaved(false); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] disabled:opacity-60">
                <Plus className="h-4 w-4" aria-hidden="true" />Add column
              </button>
            </div>
          </div>
          <div className="overflow-x-auto border border-[var(--border)]">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-alt)] text-xs font-semibold text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Team</th><th className="px-3 py-2">X1</th><th className="px-3 py-2">X4</th>
                  {cpuColumns.map((column, columnIndex) => (
                    <th key={column.id} className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input required maxLength={40} placeholder="Column name" value={column.label} onChange={(event) => { setCpuColumns((current) => current.map((item, index) => index === columnIndex ? { ...item, label: event.target.value } : item)); setSaved(false); }} aria-label={`CPU column ${columnIndex + 1} name`} className="h-9 w-28 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" />
                        <button type="button" disabled={loading || saving} onClick={() => { setCpuColumns((current) => current.filter((_, index) => index !== columnIndex)); setTeamPlatformCounts((current) => current.map((row) => ({ ...row, extraCounts: row.extraCounts.filter((_, index) => index !== columnIndex) }))); setSaved(false); }} aria-label={`Remove CPU column ${column.label || columnIndex + 1}`} title="Remove column" className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                      </div>
                    </th>
                  ))}
                  <th className="w-14 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {teamPlatformCounts.map((row, index) => (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2"><input required maxLength={60} value={row.team} onChange={(event) => updateTeam(index, "team", event.target.value)} aria-label={`Team ${index + 1}`} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                    <td className="px-3 py-2"><input required type="number" min="0" max="1000000" step="1" value={row.x1} onChange={(event) => updateTeam(index, "x1", event.target.value)} aria-label={`${row.team || `Team ${index + 1}`} X1 count`} className="h-9 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                    <td className="px-3 py-2"><input required type="number" min="0" max="1000000" step="1" value={row.x4} onChange={(event) => updateTeam(index, "x4", event.target.value)} aria-label={`${row.team || `Team ${index + 1}`} X4 count`} className="h-9 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                    {cpuColumns.map((column, columnIndex) => <td key={column.id} className="px-3 py-2"><input required type="number" min="0" max="1000000" step="1" value={row.extraCounts[columnIndex] ?? "0"} onChange={(event) => updateExtraCount(index, columnIndex, event.target.value)} aria-label={`${row.team || `Team ${index + 1}`} ${column.label || `column ${columnIndex + 1}`} count`} className="h-9 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>)}
                    <td className="px-3 py-2"><button type="button" disabled={loading || saving || teamPlatformCounts.length <= 1} onClick={() => { setTeamPlatformCounts((current) => current.filter((_, rowIndex) => rowIndex !== index)); setSaved(false); }} aria-label={`Remove ${row.team || `team ${index + 1}`}`} title="Remove team" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                  </tr>
                ))}
                {!teamPlatformCounts.length && <tr><td colSpan={4 + cpuColumns.length} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">Loading team counts…</td></tr>}
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
