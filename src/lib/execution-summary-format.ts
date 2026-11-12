function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export type ExecutionSummaryMetrics = {
  planned: number;
  latestPassed: number;
  latestFailed: number;
  latestRerunPendingRunning: number;
  blockedLines: number;
  latestNotRun: number;
  latestYetToAttempt?: number;
  runningBkc: string;
};

export function executionSummaryValues(metrics: ExecutionSummaryMetrics): Record<string, string> {
  const attempted = metrics.latestPassed + metrics.latestFailed + metrics.latestRerunPendingRunning;
  const yetToAttempt = metrics.latestYetToAttempt ?? metrics.latestNotRun;
  const count = (value: number) => value.toLocaleString("en-US");
  const percentage = (value: number) => metrics.planned ? `${(value / metrics.planned * 100).toFixed(1).replace(/\.0$/, "")}%` : "0%";
  return {
    attemptedPct: percentage(attempted), attemptedCount: count(attempted),
    passedPct: percentage(metrics.latestPassed), passedCount: count(metrics.latestPassed),
    failedPct: percentage(metrics.latestFailed), failedCount: count(metrics.latestFailed),
    blockedPct: percentage(metrics.blockedLines), blockedCount: count(metrics.blockedLines),
    notRunPct: percentage(metrics.latestNotRun), notRunCount: count(metrics.latestNotRun),
    plannedCount: count(metrics.planned), yetToAttemptPct: percentage(yetToAttempt),
    yetToAttemptCount: count(yetToAttempt), bkc: metrics.runningBkc || "BKC#40",
  };
}

function renderInline(value: string, values: Record<string, string>) {
  return escapeHtml(value)
    .replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (token, key: string) => {
      const resolved = values[key];
      if (resolved === undefined) return token;
      const color = key.startsWith("passed") ? "#087a50"
        : key.startsWith("failed") ? "#bb3846"
          : key.startsWith("blocked") ? "#aa5420"
            : key.startsWith("attempted") ? "#204e76"
              : key.startsWith("notRun") || key.startsWith("yetToAttempt") ? "#9a6313"
                : null;
      const safeValue = escapeHtml(resolved);
      return color ? `<span style="color:${color}">${safeValue}</span>` : safeValue;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\b(passed|failed|blocked)\b/gi, (word) => {
      const color = word.toLowerCase() === "passed" ? "#087a50" : word.toLowerCase() === "failed" ? "#bb3846" : "#aa5420";
      return `<span style="color:${color}">${word}</span>`;
    });
}

export function renderExecutionSummaryHtml(value: string, values: Record<string, string> = {}): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map((line) => renderInline(line, values)).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length) blocks.push(`<ul>${bullets.map((item) => `<li>${renderInline(item, values)}</li>`).join("")}</ul>`);
    bullets = [];
  };

  for (const line of value.split(/\r?\n/)) {
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
    } else if (!line.trim()) {
      flushParagraph();
      flushBullets();
    } else {
      flushBullets();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushBullets();
  return blocks.join("");
}
