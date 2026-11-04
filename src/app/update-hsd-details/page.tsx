"use client";

import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";

type HsdColumn = { id: string; label: string };
type HsdRow = Record<string, string>;
type HsdTableData = { columns: HsdColumn[]; rows: HsdRow[] };

const STORAGE_KEY = "nga-update-hsd-details-table";
const DOMAIN_OPTIONS = [
  "Security",
  "Power Management",
  "Memory",
  "Ras",
  "Reset",
  "Seamless",
  "Serial IO",
  "Virtualization",
  "Manageability",
];
const DEFAULT_COLUMNS: HsdColumn[] = [
  { id: "domain", label: "Domain" },
  { id: "hsd", label: "HSD" },
  { id: "report-type", label: "Report Type" },
  { id: "title", label: "Title" },
  { id: "failures-mapped", label: "No of failures mapped" },
  { id: "status", label: "status" },
  { id: "next-step", label: "Next Step" },
  { id: "days-open", label: "days_open" },
];

function makeEmptyRow(columns: HsdColumn[]): HsdRow {
  return Object.fromEntries(columns.map((column) => [column.id, ""]));
}

export default function UpdateHsdDetailsPage() {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [rows, setRows] = useState<HsdRow[]>([]);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const data = JSON.parse(stored) as Partial<HsdTableData>;
      if (Array.isArray(data.columns) && Array.isArray(data.rows)) {
        setColumns(data.columns
          .filter((column) => typeof column.id === "string" && typeof column.label === "string")
          .map((column) => DEFAULT_COLUMNS.find((defaultColumn) => defaultColumn.id === column.id) ?? column));
        setRows(data.rows.filter((row) => row && typeof row === "object"));
      }
    } catch {
      setSavedMessage("Could not load saved table data.");
    }
  }, []);

  const addRow = () => setRows((current) => [...current, makeEmptyRow(columns)]);

  const addColumn = () => {
    const id = `custom-${Date.now()}-${columns.length}`;
    setColumns((current) => [...current, { id, label: `New Column ${current.length - DEFAULT_COLUMNS.length + 1}` }]);
    setRows((current) => current.map((row) => ({ ...row, [id]: "" })));
  };

  const updateCell = (rowIndex: number, columnId: string, value: string) => {
    setRows((current) => current.map((row, index) =>
      index === rowIndex ? { ...row, [columnId]: value } : row,
    ));
  };

  const save = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ columns, rows } satisfies HsdTableData));
      setSavedMessage("Saved on this device.");
      window.setTimeout(() => setSavedMessage(""), 2500);
    } catch {
      setSavedMessage("Could not save table data in this browser.");
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Weekly Report</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--text)]">Update HSD Details</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={addRow} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-alt)]">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Row
          </button>
          <button type="button" onClick={addColumn} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-alt)]">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Column
          </button>
          <button type="button" onClick={save} className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-text)]">
            <Save className="h-4 w-4" aria-hidden="true" /> Save
          </button>
        </div>
      </header>

      <div className="overflow-x-auto rounded-md border border-[#34445c] bg-[#111a2b]">
        <table className="w-full min-w-[1200px] border-collapse text-left text-sm text-slate-100">
          <thead className="bg-[#1b2739] text-white">
            <tr>
              {columns.map((column) => (
                <th key={column.id} className="select-none border border-[#3b4b63] px-3 py-2 text-center align-middle font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr><td colSpan={columns.length} className="border border-[#34445c] px-4 py-8 text-center text-sm text-slate-400">No HSD details yet. Add a row to begin.</td></tr>
            )}
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-[#111a2b]" : "bg-[#18253a]"}>
                {columns.map((column) => (
                  <td key={column.id} className="border border-[#34445c] p-1.5">
                    {column.id === "domain" ? (
                      <select
                        aria-label={`Domain, row ${rowIndex + 1}`}
                        value={row[column.id] ?? ""}
                        onChange={(event) => updateCell(rowIndex, column.id, event.target.value)}
                        className="w-full min-w-40 rounded-sm bg-[#111a2b] px-1.5 py-1.5 text-sm text-slate-100 outline-none focus:bg-[#223652] focus:ring-1 focus:ring-sky-400"
                      >
                        <option value="">Select Domain</option>
                        {row[column.id] && !DOMAIN_OPTIONS.includes(row[column.id]) && (
                          <option value={row[column.id]}>{row[column.id]}</option>
                        )}
                        {DOMAIN_OPTIONS.map((domain) => (
                          <option key={domain} value={domain}>{domain}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                      aria-label={`${column.label}, row ${rowIndex + 1}`}
                      value={row[column.id] ?? ""}
                      onChange={(event) => updateCell(rowIndex, column.id, event.target.value)}
                      className="w-full min-w-24 rounded-sm bg-transparent px-1.5 py-1.5 text-sm text-slate-100 outline-none focus:bg-[#223652] focus:ring-1 focus:ring-sky-400"
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {savedMessage && <p className="mt-2 text-sm text-[var(--text-muted)]" role="status">{savedMessage}</p>}
    </main>
  );
}
