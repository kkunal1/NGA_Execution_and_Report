import { ProxyAgent, type Dispatcher } from "undici";
import { config } from "./config";

export type NetworkOverride = { vpnConnected?: boolean; proxyUrl?: string };

function matchesNoProxy(hostname: string, noProxy: string | undefined) {
  if (!noProxy) return false;
  return noProxy
    .split(",")
    .map((entry) => entry.trim().replace(/^\./, ""))
    .filter(Boolean)
    .some((entry) => hostname === entry || hostname.endsWith(`.${entry}`));
}

function targetHost() {
  try {
    return new URL(config.ngaiApiUrl).hostname;
  } catch {
    return "";
  }
}

/** Resolves the undici dispatcher for an NGAi request from explicit Settings overrides, falling back to env vars. */
export function resolveDispatcher(override?: NetworkOverride): Dispatcher | undefined {
  if (override?.vpnConnected === true) return undefined; // on VPN: go direct, no proxy
  if (override?.vpnConnected === false) {
    const proxyUrl = override.proxyUrl?.trim() || config.ngaiProxyUrl;
    return proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  }

  // No explicit override from Settings: fall back to automatic env-based detection.
  const proxyUrl =
    config.ngaiProxyUrl || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxyUrl) return undefined;
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  if (matchesNoProxy(targetHost(), noProxy)) return undefined;
  return new ProxyAgent(proxyUrl);
}
