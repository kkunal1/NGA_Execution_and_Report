export type ReportSectionVisibility = {
  executionStatusSplit: boolean;
  rawStateValues: boolean;
};

export function visibleReportSections(
  visibility: ReportSectionVisibility,
  markup: { executionStatusSplit: string; rawStateValues: string },
) {
  return `${visibility.executionStatusSplit ? markup.executionStatusSplit : ""}${visibility.rawStateValues ? markup.rawStateValues : ""}`;
}