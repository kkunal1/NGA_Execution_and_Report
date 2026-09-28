import { request as undiciRequest } from "undici";
import { config } from "./config";
import { resolveDispatcher, type NetworkOverride } from "./proxy";

export const NGAI_SUITE_NAME =
  "Oak_Stream_Platform_1_DMR-Platform_Beta-PAIV-Platform-AP1_Beta_Regression_Cycle";

type ApiRecord = Record<string, unknown>;

export class NGAiAuthError extends Error {}

function describeFetchFailure(error: unknown) {
  const cause = error instanceof Error && error.cause && typeof error.cause === "object"
    ? error.cause as { code?: string; message?: string }
    : undefined;
  const code = cause?.code;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return `Intel NGAi did not respond within ${config.ngaiTimeoutMs}ms. Check VPN/proxy access, or raise NGAI_TIMEOUT_MS in .env.local.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Intel NGAi host could not be resolved. Check VPN/DNS access.";
  if (code === "ECONNRESET" || code === "ETIMEDOUT") return "The connection to Intel NGAi timed out or was reset. Check VPN/proxy access.";
  if (code === "ECONNREFUSED") return "Intel NGAi refused the connection. This usually means the corporate proxy isn't reachable directly - set NGAI_PROXY_URL (or HTTPS_PROXY) in .env.local.";
  if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "SELF_SIGNED_CERT_IN_CHAIN") {
    return "Node could not verify the Intel NGAi TLS certificate. Set NODE_EXTRA_CA_CERTS to the Intel corporate root CA PEM file before starting Next.js.";
  }
  return `Intel NGAi network request failed${cause?.message ? `: ${cause.message}` : ` (${code ?? "no error code"})`}. Check VPN/proxy access, or set NGAI_PROXY_URL in .env.local if you're behind a corporate proxy.`;
}

function escapeOData(value: string) {
  return value.replace(/'/g, "''");
}

function recordsFromPayload(payload: unknown): ApiRecord[] {
  if (Array.isArray(payload)) return payload.filter((item): item is ApiRecord => !!item && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const body = payload as { value?: unknown; data?: unknown; items?: unknown; results?: unknown; rows?: unknown };
  for (const candidate of [body.value, body.data, body.items, body.results, body.rows]) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is ApiRecord => !!item && typeof item === "object");
  }
  return [];
}

function totalCountFromPayload(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = payload as Record<string, unknown>;
  const count = body["@odata.count"] ?? body.count ?? body.Count;
  return typeof count === "number" ? count : null;
}

const MAX_PAGES = 50;

async function pageThroughOData(
  buildUrl: (skip: number) => URL,
  headers: Record<string, string>,
  dispatcher: ReturnType<typeof resolveDispatcher>,
) {
  const pageSize = config.ngaiPageSize;
  const firstUrl = buildUrl(0);
  const allRecords: ApiRecord[] = [];
  let totalCount: number | null = null;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = buildUrl(page * pageSize);
    let statusCode: number;
    let bodyText: string;
    try {
      const res = await undiciRequest(url, {
        method: "GET",
        headers,
        dispatcher,
        headersTimeout: config.ngaiTimeoutMs,
        bodyTimeout: config.ngaiTimeoutMs,
      });
      statusCode = res.statusCode;
      bodyText = await res.body.text();
    } catch (error) {
      throw new Error(describeFetchFailure(error));
    }
    if (statusCode === 401 || statusCode === 403) {
      throw new NGAiAuthError(
        `Intel NGAi rejected the request (${statusCode}). Verify that NGAI_API_TOKEN is an active NGA PAT sent through X-NGA-PAT, or configure NGAI_COOKIE in .env.local.${bodyText ? ` Server said: ${bodyText.slice(0, 500)}` : ""}`,
      );
    }
    if (statusCode < 200 || statusCode >= 300) throw new Error(`Intel NGAi request failed (${statusCode})`);
    const payload = JSON.parse(bodyText) as unknown;
    if (page === 0) totalCount = totalCountFromPayload(payload);
    const batch = recordsFromPayload(payload);
    allRecords.push(...batch);
    const reachedTotal = totalCount != null && allRecords.length >= totalCount;
    if (batch.length < pageSize || reachedTotal) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  return { url: firstUrl.toString(), records: allRecords, totalCount, truncated };
}

export async function fetchNGAiSuite(suiteName = NGAI_SUITE_NAME, network?: NetworkOverride) {
  const pageSize = config.ngaiPageSize;
  const dispatcher = resolveDispatcher(network);
  const normalizedSuite = suiteName.toLowerCase();
  const filter = [
    "nonTriageLatestRunFlag eq true",
    `((tolower(TestLine/TestSuite/TestSuiteName) eq '${escapeOData(normalizedSuite)}') or (tolower(TestLineRevision/TestSuite/testSuiteName) eq '${escapeOData(normalizedSuite)}'))`,
  ].join(" and ");

  const buildUrl = (skip: number) => {
    const url = new URL(config.ngaiApiUrl);
    url.searchParams.set("$filter", filter);
    url.searchParams.set("$count", "true");
    url.searchParams.set("$top", String(pageSize));
    if (skip > 0) url.searchParams.set("$skip", String(skip));
    url.searchParams.set("$select", "RerunName,State,StationId,StationRevisionNumber,TestEndDateTime,TestLineId,TestRunId,TestStartDateTime,ValidationGroupId,AutoDisablingTestStepId");
    url.searchParams.set("$expand", "Failure($select=DebugSnapshotId,SightingId),Station($select=StationName),TestLine($select=TestLineName),ValidationGroup($select=testGroupName),AutoDisablingTestStep($select=TestStepName)");
    return url;
  };

  const headers: Record<string, string> = { accept: "application/json" };
  if (config.ngaiApiToken) headers["X-NGA-PAT"] = config.ngaiApiToken;
  if (config.ngaiCookie) headers.cookie = config.ngaiCookie;

  return pageThroughOData(buildUrl, headers, dispatcher);
}

// Fetches every historical Aborted run for the suite (not just the latest-per-testline snapshot
// fetchNGAiSuite uses), so date-range filtering has real abort history to work with.
export async function fetchAbortedTests(suiteName = NGAI_SUITE_NAME, network?: NetworkOverride) {
  const dispatcher = resolveDispatcher(network);
  const normalizedSuite = suiteName.toLowerCase();
  const filter = [
    "State eq 'Aborted'",
    `((tolower(TestLine/TestSuite/TestSuiteName) eq '${escapeOData(normalizedSuite)}') or (tolower(TestLineRevision/TestSuite/testSuiteName) eq '${escapeOData(normalizedSuite)}'))`,
  ].join(" and ");

  const buildUrl = (skip: number) => {
    const url = new URL(config.ngaiApiUrl);
    url.searchParams.set("$filter", filter);
    url.searchParams.set("$count", "true");
    url.searchParams.set("$top", String(config.ngaiPageSize));
    if (skip > 0) url.searchParams.set("$skip", String(skip));
    url.searchParams.set("$select", "State,TestEndDateTime,TestLineId,TestRunId,TestStartDateTime,AutoDisablingTestStepId");
    url.searchParams.set("$expand", "TestLine($select=TestLineName),AutoDisablingTestStep($select=TestStepName)");
    return url;
  };

  const headers: Record<string, string> = { accept: "application/json" };
  if (config.ngaiApiToken) headers["X-NGA-PAT"] = config.ngaiApiToken;
  if (config.ngaiCookie) headers.cookie = config.ngaiCookie;

  return pageThroughOData(buildUrl, headers, dispatcher);
}