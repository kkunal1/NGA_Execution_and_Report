import { Send } from "lucide-react";
import WeeklyReportMailPanel from "@/components/WeeklyReportMailPanel";

export default function WeeklyReportEmailPage() {
  return (
    <div className="mx-auto max-w-7xl text-[var(--text)]">
      <div className="mb-5 flex items-center gap-2">
        <Send className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
        <h1 className="text-lg font-semibold">Send Report Over Email</h1>
      </div>
      <WeeklyReportMailPanel />
    </div>
  );
}
