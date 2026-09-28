import path from "node:path";

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined ? fallback : !/^(false|0|no)$/i.test(v.trim());

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  url:
    process.env.NGA_URL ??
    "https://nga.laas.intel.com/#/dmr_pv/planning/testlines",
  filterEntity: process.env.NGA_FILTER_ENTITY ?? "TestLine",
  filterField: process.env.NGA_FILTER_FIELD ?? "Suite",
  filterOperator: process.env.NGA_FILTER_OPERATOR ?? "Equal",
  stateColumn: process.env.NGA_STATE_COLUMN ?? "Last Rerun State",
  unlockButton: process.env.NGA_UNLOCK_BUTTON ?? "Get Latest Testline",
  suiteName:
    process.env.NGA_SUITE_NAME ??
    "Oak_Stream_Platform_1_DMR-Platform_Beta-PAIV-Platform-AP1_Beta_Regression_Cycle",
  headless: bool(process.env.NGA_HEADLESS, true),
  channel: process.env.NGA_BROWSER_CHANNEL ?? "chrome",
  navTimeoutMs: num(process.env.NGA_NAV_TIMEOUT_MS, 120_000),
  settleMs: num(process.env.NGA_SETTLE_MS, 6_000),
  profileDir: path.resolve(
    process.cwd(),
    process.env.NGA_PROFILE_DIR ?? ".browser-profile",
  ),
  dataDir: path.resolve(process.cwd(), process.env.NGA_DATA_DIR ?? "data"),
  reportsDir: path.resolve(process.cwd(), process.env.NGA_REPORTS_DIR ?? "reports"),
  artifactsDir: path.resolve(process.cwd(), "artifacts"),
  ngaiApiUrl:
    process.env.NGAI_API_URL ??
    "https://nga-prod.laas.icloud.intel.com/Search/dmr_pv/odata/v1/TestRunComposite",
  ngaiApiToken: process.env.NGAI_API_TOKEN ?? "",
  ngaiCookie: process.env.NGAI_COOKIE ?? "",
  ngaiPageSize: num(process.env.NGAI_PAGE_SIZE, 1000),
  ngaiProxyUrl: process.env.NGAI_PROXY_URL ?? "",
  ngaiTimeoutMs: num(process.env.NGAI_TIMEOUT_MS, 60_000),
} as const;

export type AppConfig = typeof config;
