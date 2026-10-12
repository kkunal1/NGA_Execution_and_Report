export const DEFAULT_WEEKLY_REPORT_BKC = "BKC#40";
export const DEFAULT_WEEKLY_REPORT_HSDES_LINK = "https://hsdes.intel.com/appstore/generalapps/#/pages/community/15010407190?queryId=16032003391&articleId=16031656538";

export type TeamPlatformCount = { team: string; x1: number; x4: number };
export type WeeklyReportLink = { label: string; url: string };
export type WeeklyReportContent = {
  links: WeeklyReportLink[];
  executionSummaryTitle: string;
  failureProgressNote: string;
  reportReviewNote: string;
};

export const DEFAULT_TEAM_PLATFORM_COUNTS: TeamPlatformCount[] = [
  { team: "PV.BKC", x1: 6, x4: 2 },
  { team: "DM", x1: 2, x4: 0 },
  { team: "DPMO", x1: 9, x4: 5 },
  { team: "Execution", x1: 39, x4: 6 },
];

export const DEFAULT_WEEKLY_REPORT_CONTENT: WeeklyReportContent = {
  links: [{ label: "PV VV Exec Summary Dashboard", url: "https://xve-dashboards.intel.com/dmr-ap/execution-summary" }],
  executionSummaryTitle: "DMR-AP1 B0 Execution Status Summary",
  failureProgressNote: "Failure analysis and rerun in progress.",
  reportReviewNote: "This report was generated with AI assistance. The updates have been reviewed for accuracy.",
};
