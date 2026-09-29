import { request as undiciRequest } from "undici";
import { config } from "./config";
import { getNgaiApiToken } from "./ngai-token";
import { resolveDispatcher } from "./proxy";

export const NGAI_POOL_NAME = "pv_dmr-ap-ap1-b0";

export type PoolSystem = {
  id: string;
  name: string;
  config: string;
  executionStatus: string;
};

type SystemRecord = {
  systemId?: unknown;
  systemName?: unknown;
  station?: {
    executionState?: unknown;
    config?: { configName?: unknown };
  };
};

function systemsUrl() {
  const url = new URL(config.ngaiApiUrl);
  url.pathname = url.pathname.replace(/\/TestRunComposite\/?$/, "/System");
  url.searchParams.set("$filter", `Station/LatestStationPool/any(p: p/Pool/PoolName eq '${NGAI_POOL_NAME}')`);
  url.searchParams.set("$top", "100");
  url.searchParams.set("$select", "SystemId,SystemName,SystemRevisionNumber");
  url.searchParams.set("$expand", "Station($select=ExecutionState;$expand=Config($select=ConfigName))");
  return url;
}

export async function fetchPoolSystems(): Promise<PoolSystem[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  const apiToken = await getNgaiApiToken();
  if (apiToken) headers["X-NGA-PAT"] = apiToken;
  if (config.ngaiCookie) headers.cookie = config.ngaiCookie;

  const response = await undiciRequest(systemsUrl(), {
    method: "GET",
    headers,
    dispatcher: resolveDispatcher(),
    headersTimeout: config.ngaiTimeoutMs,
    bodyTimeout: config.ngaiTimeoutMs,
  });
  const body = await response.body.text();
  if (response.statusCode === 401 || response.statusCode === 403) {
    throw new Error("Intel NGAi rejected the pool systems request. Check the configured NGAi token or cookie.");
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Intel NGAi pool systems request failed (${response.statusCode}).`);
  }

  const payload = JSON.parse(body) as { value?: SystemRecord[] } | SystemRecord[];
  const records = Array.isArray(payload) ? payload : payload.value ?? [];
  return records
    .map((record) => ({
      id: typeof record.systemId === "string" ? record.systemId : "",
      name: typeof record.systemName === "string" ? record.systemName : "Unknown system",
      config: typeof record.station?.config?.configName === "string" ? record.station.config.configName : "Not available",
      executionStatus: typeof record.station?.executionState === "string" ? record.station.executionState : "Unknown",
    }))
    .filter((system) => system.id && system.name)
    .sort((left, right) => left.name.localeCompare(right.name));
}
