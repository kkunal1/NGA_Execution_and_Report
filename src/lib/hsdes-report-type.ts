function reportTypeValue(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized && normalized.toLowerCase() !== "unknown" ? normalized : null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["value", "name", "label", "displayName", "title", "report_type", "reportType"]) {
    const nested = reportTypeValue(record[key]);
    if (nested) return nested;
  }
  return null;
}

export function normalizeHsdesReportType(...values: unknown[]): string {
  for (const value of values) {
    const normalized = reportTypeValue(value);
    if (normalized) return normalized;
  }
  return "Unknown";
}

export function reportTypeFromRecord(record: Record<string, unknown>): string {
  const preferred = [
    record.report_type,
    record.reportType,
    record["bug.report_type"],
    record["sighting.report_type"],
    record["presighting.report_type"],
    record["sighting_central.sighting.report_type"],
    record["server_platf.bug.report_type"],
  ];
  const prefixed = Object.entries(record)
    .filter(([key]) => key.toLowerCase().replace(/[^a-z0-9]/g, "").endsWith("reporttype"))
    .map(([, value]) => value);
  return normalizeHsdesReportType(...preferred, ...prefixed);
}