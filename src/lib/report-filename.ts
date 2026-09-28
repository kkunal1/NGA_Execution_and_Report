const pad2 = (n: number) => String(n).padStart(2, "0");

/** Builds a safe filename for one or more suite names. */
export function buildReportFilename(suiteName: string, date = new Date()): string {
  const safeSuite = (suiteName || "execution-report")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "execution-report";
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours24 = date.getHours();
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = pad2(hours24 % 12 || 12);
  const minutes = pad2(date.getMinutes());
  return `${safeSuite}_${day}_${month}_${year}_${hours12}:${minutes}${period}.html`;
}