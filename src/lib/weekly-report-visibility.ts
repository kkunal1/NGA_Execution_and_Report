export type WeeklyReportSectionSettings = {
  cpuAllocation: boolean;
  hsdFailureSummary: boolean;
  domainWise: boolean;
  overallFailureBreakdown: boolean;
};

export const DEFAULT_WEEKLY_REPORT_SECTIONS: WeeklyReportSectionSettings = {
  cpuAllocation: true,
  hsdFailureSummary: true,
  domainWise: true,
  overallFailureBreakdown: true,
};