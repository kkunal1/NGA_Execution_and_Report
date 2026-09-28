export type DataProvider = "sso" | "ngai";

export const DATA_PROVIDER_KEY = "nga-data-provider";

// "true"/"false" string, or absent (meaning: use the server's automatic env-based detection).
export const NGAI_VPN_KEY = "nga-ngai-vpn-connected";
export const NGAI_PROXY_KEY = "nga-ngai-proxy-url";

export function readNgaiNetworkOverride(): { vpnConnected?: boolean; proxyUrl?: string } | undefined {
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem(NGAI_VPN_KEY);
  if (stored !== "true" && stored !== "false") return undefined;
  return { vpnConnected: stored === "true", proxyUrl: window.localStorage.getItem(NGAI_PROXY_KEY) ?? undefined };
}

export const DATA_PROVIDERS: { value: DataProvider; label: string; description: string }[] = [
  {
    value: "sso",
    label: "Intel SSO",
    description: "Capture Testline execution data through the authenticated NGA browser session.",
  },
  {
    value: "ngai",
    label: "Intel NGAi",
    description: "Query the regression suite directly through the Intel NGAi TestRunComposite API without opening Chrome.",
  },
];
