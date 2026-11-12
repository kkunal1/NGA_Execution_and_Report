"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bold, Check, Italic, List, Pencil, Plus, Trash2 } from "lucide-react";
import type { CpuBaseLabels, CustomReportTable, TeamPlatformCount, WeeklyReportLink } from "@/lib/weekly-report-settings";
import { DEFAULT_CPU_ALLOCATION_TITLE, displayCpuAllocationTitle } from "@/lib/weekly-report-display";
import { DEFAULT_EXECUTION_SUMMARY_TEXT, DEFAULT_WEEKLY_REPORT_SUITES, EXECUTION_SUMMARY_PREVIEW_VALUES } from "@/lib/weekly-report-defaults";
import { renderExecutionSummaryHtml } from "@/lib/execution-summary-format";

type EditableTeamPlatformCount = { id: string; team: string; x1: string; x4: string; extraCounts: string[] };
type EditableCpuColumn = { id: string; label: string };
type EditableWeeklyReportLink = { id: string; label: string; url: string };
type EditableSuite = { id: string; suiteName: string };

const createRowId = () => typeof globalThis.crypto?.randomUUID === "function"
  ? globalThis.crypto.randomUUID()
  : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function UpdateWeeklyReportPage() {
  const [bkc, setBkc] = useState("BKC#40");
  const [suites, setSuites] = useState<EditableSuite[]>(DEFAULT_WEEKLY_REPORT_SUITES.map((suiteName) => ({ id: createRowId(), suiteName })));
  const [executionSummaryText, setExecutionSummaryText] = useState(DEFAULT_EXECUTION_SUMMARY_TEXT);
  const [cpuAllocationEnabled, setCpuAllocationEnabled] = useState(true);
  const executionSummaryRef = useRef<HTMLTextAreaElement>(null);
  const [teamPlatformCounts, setTeamPlatformCounts] = useState<EditableTeamPlatformCount[]>([]);
  const [cpuColumns, setCpuColumns] = useState<EditableCpuColumn[]>([]);
  const [cpuBaseLabels, setCpuBaseLabels] = useState<CpuBaseLabels>({ team: "Team", x1: "X1", x4: "X4" });
  const [editingBaseLabel, setEditingBaseLabel] = useState<keyof CpuBaseLabels | null>(null);
  const [cpuBreakdownTitle, setCpuBreakdownTitle] = useState(DEFAULT_CPU_ALLOCATION_TITLE);
  const [cpuTitleEditing, setCpuTitleEditing] = useState(false);
  const [hsdesLink, setHsdesLink] = useState("");
  const [links, setLinks] = useState<EditableWeeklyReportLink[]>([]);
  const [customTables, setCustomTables] = useState<CustomReportTable[]>([]);
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
          suites?: string[];
          executionSummaryText?: string;
          cpuAllocationEnabled?: boolean;
          teamPlatformCounts?: TeamPlatformCount[];
          cpuColumns?: string[];
          cpuBaseLabels?: CpuBaseLabels;
          cpuBreakdownTitle?: string;
          hsdesLink?: string;
          links?: WeeklyReportLink[];
          customTables?: CustomReportTable[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Could not load the saved BKC value.");
        if (!cancelled) {
          if (result.bkc) setBkc(result.bkc);
          setSuites((result.suites ?? DEFAULT_WEEKLY_REPORT_SUITES).map((suiteName) => ({ id: createRowId(), suiteName })));
          setExecutionSummaryText(result.executionSummaryText ?? DEFAULT_EXECUTION_SUMMARY_TEXT);
          setCpuAllocationEnabled(result.cpuAllocationEnabled !== false);
          setCpuColumns((result.cpuColumns ?? []).map((label) => ({ id: createRowId(), label })));
          setCpuBaseLabels(result.cpuBaseLabels ?? { team: "Team", x1: "X1", x4: "X4" });
          setCpuBreakdownTitle(displayCpuAllocationTitle(result.cpuBreakdownTitle));
          setTeamPlatformCounts((result.teamPlatformCounts ?? []).map((row) => ({ id: createRowId(), team: row.team, x1: String(row.x1), x4: String(row.x4), extraCounts: (row.extraCounts ?? []).map(String) })));
          setHsdesLink(result.hsdesLink ?? "");
          setLinks((result.links ?? []).map((link) => ({ ...link, id: createRowId() })));
          setCustomTables(result.customTables ?? []);
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
          suites: suites.map((suite) => suite.suiteName),
          executionSummaryText,
          cpuAllocationEnabled,
          teamPlatformCounts: teamPlatformCounts.map((row) => ({ team: row.team, x1: Number(row.x1), x4: Number(row.x4), extraCounts: row.extraCounts.map(Number) })),
          cpuColumns: cpuColumns.map((column) => column.label),
          cpuBaseLabels,
          cpuBreakdownTitle,
          hsdesLink,
          links: links.map((link) => ({ label: link.label, url: link.url })),
          customTables,
        }),
      });
      const result = (await response.json()) as {
        bkc?: string;
        suites?: string[];
        executionSummaryText?: string;
        cpuAllocationEnabled?: boolean;
        teamPlatformCounts?: TeamPlatformCount[];
        cpuColumns?: string[];
        cpuBaseLabels?: CpuBaseLabels;
        cpuBreakdownTitle?: string;
        hsdesLink?: string;
        links?: WeeklyReportLink[];
        customTables?: CustomReportTable[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Could not save the BKC value.");
      setBkc(result.bkc ?? bkc.trim());
      setSuites((result.suites ?? suites.map((suite) => suite.suiteName.trim()).filter(Boolean)).map((suiteName) => ({ id: createRowId(), suiteName })));
      setExecutionSummaryText(result.executionSummaryText ?? executionSummaryText.trim());
      setCpuAllocationEnabled(result.cpuAllocationEnabled !== false);
      setCpuColumns((result.cpuColumns ?? []).map((label) => ({ id: createRowId(), label })));
      setCpuBaseLabels(result.cpuBaseLabels ?? cpuBaseLabels);
      setEditingBaseLabel(null);
      setCpuBreakdownTitle(result.cpuBreakdownTitle ?? cpuBreakdownTitle.trim());
      setCpuTitleEditing(false);
      setTeamPlatformCounts((result.teamPlatformCounts ?? []).map((row) => ({ id: createRowId(), team: row.team, x1: String(row.x1), x4: String(row.x4), extraCounts: (row.extraCounts ?? []).map(String) })));
      setHsdesLink(result.hsdesLink ?? hsdesLink.trim());
      setLinks((result.links ?? []).map((link) => ({ ...link, id: createRowId() })));
      setCustomTables(result.customTables ?? customTables);
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

  const updateCustomTable = (index: number, update: (table: CustomReportTable) => CustomReportTable) => {
    setCustomTables((current) => current.map((table, tableIndex) => tableIndex === index ? update(table) : table));
    setSaved(false);
  };

  const addCustomTable = () => {
    setCustomTables((current) => [...current, {
      id: createRowId(),
      title: `Custom Table ${current.length + 1}`,
      columns: ["Column 1"],
      rows: [[""]],
      enabled: true,
    }]);
    setSaved(false);
  };

  const insertSummaryFormat = (prefix: string, suffix = prefix) => {
    const textarea = executionSummaryRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || "text";
    const insertion = `${prefix}${selected}${suffix}`;
    textarea.setRangeText(insertion, start, end, "select");
    setExecutionSummaryText(textarea.value);
    setSaved(false);
    textarea.focus();
  };

  const insertSummaryBullet = () => {
    const textarea = executionSummaryRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    textarea.setRangeText("- ", lineStart, lineStart, "end");
    setExecutionSummaryText(textarea.value);
    setSaved(false);
    textarea.focus();
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-muted)]">Reporting / Configuration</p>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Update Weekly Report</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Configure report suites, summary notes, HSDES lookup, allocation, links, and custom tables.</p>
        </div>
      </header>
      <form onSubmit={save} className="space-y-4">
        <div className="flex justify-end">
          <button type="submit" disabled={loading || saving} className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving…" : "Save updates"}</button>
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby="weekly-report-setup-heading">
          <h2 id="weekly-report-setup-heading" className="text-base font-semibold text-[var(--text)]">Report setup</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Set the active BKC and HSDES source used for new reports.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-[var(--text)]" htmlFor="weekly-report-bkc">BKC
              <input
                id="weekly-report-bkc"
                required
                pattern="BKC#(WW)?[0-9]+"
                value={bkc}
                onChange={(event) => { setBkc(event.target.value); setSaved(false); }}
                disabled={loading || saving}
                aria-describedby="weekly-report-bkc-status"
                className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
              />
            </label>
            <label className="block text-sm font-medium text-[var(--text)]" htmlFor="weekly-report-hsdes-link">HSDES sighting query link
              <input
                id="weekly-report-hsdes-link"
                required
                type="url"
                value={hsdesLink}
                onChange={(event) => { setHsdesLink(event.target.value); setSaved(false); }}
                disabled={loading || saving}
                placeholder="Paste the HSDES General Apps link containing queryId"
                className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
              />
              <span className="mt-1 block text-xs text-[var(--text-muted)]">Queries Sighting records using Kerberos on the report host.</span>
            </label>
          </div>
        </section>
        <section className="space-y-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby="weekly-report-suites-heading">
          <div>
            <h2 id="weekly-report-suites-heading" className="text-base font-semibold text-[var(--text)]">Execution Suites</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Counts and percentages are calculated from the selected suite list.</p>
          </div>
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--text-muted)]">NGAi suite names</span>
              <button type="button" disabled={loading || saving || suites.length >= 20} onClick={() => { setSuites((current) => [...current, { id: createRowId(), suiteName: "" }]); setSaved(false); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] disabled:opacity-60">
                <Plus className="h-4 w-4" aria-hidden="true" />Add suite
              </button>
            </div>
            <div className="space-y-2">
              {suites.map((suite, index) => (
                <div key={suite.id} className="flex items-center gap-2">
                  <label className="min-w-0 flex-1 text-xs font-medium text-[var(--text-muted)]" htmlFor={`weekly-report-suite-${index}`}>Suite {index + 1}
                    <input id={`weekly-report-suite-${index}`} required maxLength={512} value={suite.suiteName} onChange={(event) => { setSuites((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, suiteName: event.target.value } : item)); setSaved(false); }} disabled={loading || saving} className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]" />
                  </label>
                  <button type="button" disabled={loading || saving || suites.length <= 1} onClick={() => { setSuites((current) => current.filter((_, itemIndex) => itemIndex !== index)); setSaved(false); }} aria-label={`Remove suite ${index + 1}`} title="Remove suite" className="mt-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
              ))}
            </div>
          </div>
        </section>
        </div>
        <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby="execution-summary-section-heading">
          <div>
            <h2 id="execution-summary-section-heading" className="text-base font-semibold text-[var(--text)]">Execution Summary Section</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Add optional formatted notes to appear with the generated execution metrics.</p>
          </div>
          <div className="max-w-4xl">
            <label className="block text-sm font-semibold text-[var(--text)]" htmlFor="execution-summary-text">Execution summary notes</label>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Edit the full summary text. Dynamic placeholders are replaced with each report&apos;s latest counts, percentages, and BKC.</p>
            <div className="mt-3 flex flex-wrap gap-1 rounded-t-md border border-[var(--border)] bg-[var(--surface-alt)] p-2">
              <button type="button" disabled={loading || saving} onClick={() => insertSummaryFormat("**")} aria-label="Bold selected text" title="Bold" className="flex h-8 w-8 items-center justify-center rounded text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"><Bold className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" disabled={loading || saving} onClick={() => insertSummaryFormat("*")} aria-label="Italicize selected text" title="Italic" className="flex h-8 w-8 items-center justify-center rounded text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"><Italic className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" disabled={loading || saving} onClick={insertSummaryBullet} aria-label="Add bullet" title="Bullet list" className="flex h-8 w-8 items-center justify-center rounded text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"><List className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <textarea id="execution-summary-text" ref={executionSummaryRef} rows={5} maxLength={10_000} value={executionSummaryText} onChange={(event) => { setExecutionSummaryText(event.target.value); setSaved(false); }} disabled={loading || saving} placeholder="Add summary notes…" className="w-full rounded-b-md border border-t-0 border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]" />
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Available tokens: <code>{"{{attemptedPct}}"}</code>, <code>{"{{passedPct}}"}</code>, <code>{"{{failedPct}}"}</code>, <code>{"{{blockedPct}}"}</code>, <code>{"{{plannedCount}}"}</code>, <code>{"{{bkc}}"}</code> and their matching <code>Count</code> values.</p>
            <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm leading-relaxed text-[var(--text)] [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5" aria-label="Execution summary preview" dangerouslySetInnerHTML={{ __html: renderExecutionSummaryHtml(executionSummaryText, EXECUTION_SUMMARY_PREVIEW_VALUES) }} />
          </div>
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby="weekly-report-links-heading">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="weekly-report-links-heading" className="text-base font-semibold text-[var(--text)]">Report Links</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Reusable links included in reports, email, and HTML attachments.</p>
              </div>
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
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
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
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--text)]">
                <input type="checkbox" role="switch" checked={cpuAllocationEnabled} onChange={(event) => { setCpuAllocationEnabled(event.target.checked); setSaved(false); }} disabled={loading || saving} className="h-4 w-4 accent-[var(--accent)]" />
                Include in reports
              </label>
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
                  {(["team", "x1", "x4"] as const).map((columnKey) => (
                    <th key={columnKey} className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {editingBaseLabel === columnKey ? (
                          <input
                            autoFocus
                            required
                            maxLength={40}
                            value={cpuBaseLabels[columnKey]}
                            onChange={(event) => { setCpuBaseLabels((current) => ({ ...current, [columnKey]: event.target.value })); setSaved(false); }}
                            aria-label={`Edit ${columnKey === "team" ? "Team" : columnKey.toUpperCase()} column name`}
                            className="h-9 w-28 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]"
                          />
                        ) : <span className="break-words">{cpuBaseLabels[columnKey]}</span>}
                        <button
                          type="button"
                          onClick={() => setEditingBaseLabel((current) => current === columnKey ? null : columnKey)}
                          disabled={loading || saving || (editingBaseLabel === columnKey && !cpuBaseLabels[columnKey].trim())}
                          aria-label={editingBaseLabel === columnKey ? `Finish editing ${columnKey} column` : `Edit ${columnKey} column`}
                          title={editingBaseLabel === columnKey ? "Finish editing" : "Edit column"}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] disabled:opacity-50"
                        >
                          {editingBaseLabel === columnKey ? <Check className="h-4 w-4" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </th>
                  ))}
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
                    <td className="px-3 py-2"><input required maxLength={60} value={row.team} onChange={(event) => updateTeam(index, "team", event.target.value)} aria-label={`${cpuBaseLabels.team} ${index + 1}`} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                    <td className="px-3 py-2"><input required type="number" min="0" max="1000000" step="1" value={row.x1} onChange={(event) => updateTeam(index, "x1", event.target.value)} aria-label={`${row.team || `Team ${index + 1}`} ${cpuBaseLabels.x1} count`} className="h-9 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                    <td className="px-3 py-2"><input required type="number" min="0" max="1000000" step="1" value={row.x4} onChange={(event) => updateTeam(index, "x4", event.target.value)} aria-label={`${row.team || `Team ${index + 1}`} ${cpuBaseLabels.x4} count`} className="h-9 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>
                    {cpuColumns.map((column, columnIndex) => <td key={column.id} className="px-3 py-2"><input required type="number" min="0" max="1000000" step="1" value={row.extraCounts[columnIndex] ?? "0"} onChange={(event) => updateExtraCount(index, columnIndex, event.target.value)} aria-label={`${row.team || `Team ${index + 1}`} ${column.label || `column ${columnIndex + 1}`} count`} className="h-9 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" /></td>)}
                    <td className="px-3 py-2"><button type="button" disabled={loading || saving || teamPlatformCounts.length <= 1} onClick={() => { setTeamPlatformCounts((current) => current.filter((_, rowIndex) => rowIndex !== index)); setSaved(false); }} aria-label={`Remove ${row.team || `team ${index + 1}`}`} title="Remove team" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                  </tr>
                ))}
                {!teamPlatformCounts.length && <tr><td colSpan={4 + cpuColumns.length} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">Loading team counts…</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="space-y-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">Custom Report Tables</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">New tables appear in newly generated reports, email, and HTML attachments.</p>
            </div>
            <button type="button" disabled={loading || saving || customTables.length >= 10} onClick={addCustomTable} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] disabled:opacity-60">
              <Plus className="h-4 w-4" aria-hidden="true" />Create table
            </button>
          </div>
          {customTables.map((table, tableIndex) => (
            <section key={table.id} className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="min-w-60 flex-1 text-sm font-medium text-[var(--text)]">Table title
                  <input required maxLength={120} value={table.title} onChange={(event) => updateCustomTable(tableIndex, (current) => ({ ...current, title: event.target.value }))} aria-label={`Custom table ${tableIndex + 1} title`} className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" />
                </label>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--text)]">
                  <input type="checkbox" role="switch" checked={table.enabled !== false} onChange={(event) => updateCustomTable(tableIndex, (current) => ({ ...current, enabled: event.target.checked }))} disabled={loading || saving} className="h-4 w-4 accent-[var(--accent)]" />
                  Include in reports
                </label>
                <button type="button" disabled={loading || saving} onClick={() => { setCustomTables((current) => current.filter((_, index) => index !== tableIndex)); setSaved(false); }} aria-label={`Remove custom table ${tableIndex + 1}`} title="Remove table" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                <div className="flex gap-2">
                  <button type="button" disabled={loading || saving || table.rows.length >= 100} onClick={() => updateCustomTable(tableIndex, (current) => ({ ...current, rows: [...current.rows, current.columns.map(() => "")] }))} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden="true" />Add row</button>
                  <button type="button" disabled={loading || saving || table.columns.length >= 12} onClick={() => updateCustomTable(tableIndex, (current) => ({ ...current, columns: [...current.columns, `Column ${current.columns.length + 1}`], rows: current.rows.map((row) => [...row, ""]) }))} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden="true" />Add column</button>
                </div>
              </div>
              <div className="overflow-x-auto border border-[var(--border)]">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead className="bg-[var(--surface-alt)] text-xs font-semibold text-[var(--text-muted)]">
                    <tr>
                      {table.columns.map((column, columnIndex) => (
                        <th key={`${table.id}-column-${columnIndex}`} className="min-w-40 px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input required maxLength={60} value={column} onChange={(event) => updateCustomTable(tableIndex, (current) => ({ ...current, columns: current.columns.map((label, index) => index === columnIndex ? event.target.value : label) }))} aria-label={`Custom table ${tableIndex + 1} column ${columnIndex + 1}`} className="h-9 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" />
                            <button type="button" disabled={loading || saving || table.columns.length <= 1} onClick={() => updateCustomTable(tableIndex, (current) => ({ ...current, columns: current.columns.filter((_, index) => index !== columnIndex), rows: current.rows.map((row) => row.filter((_, index) => index !== columnIndex)) }))} aria-label={`Remove custom table ${tableIndex + 1} column ${columnIndex + 1}`} title="Remove column" className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                          </div>
                        </th>
                      ))}
                      <th className="w-14 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={`${table.id}-row-${rowIndex}`} className="border-t border-[var(--border)]">
                        {table.columns.map((_, columnIndex) => (
                          <td key={`${table.id}-row-${rowIndex}-cell-${columnIndex}`} className="px-3 py-2">
                            <input maxLength={500} value={row[columnIndex] ?? ""} onChange={(event) => updateCustomTable(tableIndex, (current) => ({ ...current, rows: current.rows.map((cells, index) => index === rowIndex ? cells.map((cell, cellIndex) => cellIndex === columnIndex ? event.target.value : cell) : cells) }))} aria-label={`Custom table ${tableIndex + 1} row ${rowIndex + 1} column ${columnIndex + 1}`} className="h-9 w-full min-w-32 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]" />
                          </td>
                        ))}
                        <td className="px-3 py-2"><button type="button" disabled={loading || saving} onClick={() => updateCustomTable(tableIndex, (current) => ({ ...current, rows: current.rows.filter((_, index) => index !== rowIndex) }))} aria-label={`Remove custom table ${tableIndex + 1} row ${rowIndex + 1}`} title="Remove row" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                      </tr>
                    ))}
                    {!table.rows.length && <tr><td colSpan={table.columns.length + 1} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No rows. Add a row to enter table data.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!customTables.length && <p className="text-sm text-[var(--text-muted)]">No custom tables. Create a table to add one to future reports.</p>}
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
