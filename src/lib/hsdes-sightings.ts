import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { normalizeWeeklyReportHsdesLink } from "./weekly-report-settings";

const execFile = promisify(execFileCallback);
const MAX_RESULTS = 20_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

type HsdesQueryRecord = {
  id?: unknown;
  report_type?: unknown;
  team_found?: unknown;
};

type HsdesQueryResponse = {
  data?: unknown;
  total?: unknown;
};

const TEAM_FOUND_DOMAINS: Record<string, string> = {
  pm_subsystem_validation: "pv_power_management",
  seamless_subsystem_validation: "pv_seamless",
  io_subsystem_validation: "pv_serial_io",
  manageability_subsystem_validation: "pv_manageability",
  security_subsystem_validation: "pv_security",
  ras_subsystem_validation: "pv_ras",
  virtualization_subsystem_validation: "pv_virtualization",
};

export function canonicalizeSightingDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return TEAM_FOUND_DOMAINS[key] ?? (Object.values(TEAM_FOUND_DOMAINS).includes(key) ? key : null);
}

export function aggregateHsdesSightings(records: unknown[]): Record<string, number> {
  const idsByGroup = new Map<string, Set<string>>();
  for (const value of records) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as HsdesQueryRecord;
    if (typeof record.report_type !== "string" || record.report_type.trim().toLowerCase() !== "sighting") continue;
    if (typeof record.id !== "string" || !record.id.trim()) continue;
    const group = typeof record.team_found === "string" ? TEAM_FOUND_DOMAINS[record.team_found.trim().toLowerCase()] : undefined;
    if (!group) continue;
    const ids = idsByGroup.get(group) ?? new Set<string>();
    ids.add(record.id.trim());
    idsByGroup.set(group, ids);
  }
  return Object.fromEntries([...idsByGroup.entries()].map(([group, ids]) => [group, ids.size]));
}

export async function fetchHsdesSightingCounts(linkValue: string): Promise<Record<string, number>> {
  const link = normalizeWeeklyReportHsdesLink(linkValue);
  if (!link) throw new Error("The saved HSDES link is invalid or has no queryId.");
  const linkUrl = new URL(link);
  const fragmentQuery = linkUrl.hash.slice(1).split("?")[1] ?? "";
  const queryId = new URLSearchParams(fragmentQuery).get("queryId");
  if (!queryId) throw new Error("The saved HSDES link is missing its queryId.");

  const url = new URL(`https://hsdes.intel.com/rest/query/execution/${queryId}`);
  url.searchParams.set("max_results", String(MAX_RESULTS));
  url.searchParams.set("start_at", "1");
  url.searchParams.set("tranId", randomUUID());

  const curl = process.platform === "win32" ? "curl.exe" : "curl";
  const args = [
    "--negotiate", "--user", ":", "--silent", "--show-error", "--max-time", "60",
    "--request", "POST", "--header", "Content-Type: application/json",
    "--data", "{}", "--write-out", "\nHTTP_STATUS:%{http_code}", url.toString(),
  ];
  let stdout: string;
  try {
    ({ stdout } = await execFile(curl, args, { timeout: 65_000, maxBuffer: MAX_RESPONSE_BYTES, windowsHide: true }));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error("curl with Kerberos Negotiate support is required on the Weekly Report host.");
    if (code === "ETIMEDOUT" || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new Error("The HSDES Kerberos query timed out or exceeded its response limit.");
    throw new Error("The HSDES Kerberos request failed. Check the host's Kerberos ticket and curl Negotiate support.");
  }

  const statusMarker = "\nHTTP_STATUS:";
  const statusIndex = stdout.lastIndexOf(statusMarker);
  if (statusIndex < 0) throw new Error("The HSDES Kerberos request returned an unreadable response.");
  const status = Number(stdout.slice(statusIndex + statusMarker.length).trim());
  if (status === 401) {
    throw new Error("HSDES rejected Kerberos authentication (HTTP 401). The Weekly Report host needs a valid Kerberos ticket for HTTP/hsdes.intel.com; browser SSO alone does not provide one.");
  }
  if (status === 403) {
    throw new Error("HSDES denied this Kerberos principal (HTTP 403). Check that the app host account has access to the saved query.");
  }
  if (status < 200 || status >= 300) throw new Error(`The HSDES query API returned HTTP ${status}.`);

  let response: HsdesQueryResponse;
  try {
    response = JSON.parse(stdout.slice(0, statusIndex)) as HsdesQueryResponse;
  } catch {
    throw new Error("The HSDES query API returned invalid JSON.");
  }
  if (!Array.isArray(response.data)) throw new Error("The HSDES query response did not contain a data list.");
  const total = Number(response.total);
  if (Number.isFinite(total) && total > response.data.length) {
    throw new Error(`The HSDES query returned ${response.data.length} of ${total} rows; reduce the query result set before reporting.`);
  }
  return aggregateHsdesSightings(response.data);
}
