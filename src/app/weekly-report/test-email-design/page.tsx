"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { renderTemporaryTestEmail, TEMPORARY_EMAIL_SUBJECT } from "@/lib/temporary-test-email";

export default function TestEmailDesignPage() {
  const [sender, setSender] = useState("");
  const [recipient, setRecipient] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/mail/test-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, recipient, password }),
      });
      const result = await response.json() as { sentTo?: string; filename?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not send the test email.");
      setPassword("");
      setMessage(`Test email sent to ${result.sentTo}. Attachment: ${result.filename}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the test email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl text-[var(--text)]">
      <div className="mb-5 flex items-center gap-2"><Send className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" /><h1 className="text-lg font-semibold">Test Email Design (Temporary)</h1></div>
      <form onSubmit={(event) => void send(event)} className="border-y border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="mb-3 text-sm text-[var(--text-muted)]">Dummy report only. The test email is sent to one recipient with no automatic CC.</p>
        <div className="grid max-w-4xl gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-[var(--text-muted)]">Sender email<input required type="email" autoComplete="email" value={sender} onChange={(event) => setSender(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]" /></label>
          <label className="text-xs font-semibold text-[var(--text-muted)]">Test recipient<input required type="email" autoComplete="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]" /></label>
          <label className="text-xs font-semibold text-[var(--text-muted)]">Intel mail password<input required type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]" /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] disabled:opacity-60"><Send className="h-4 w-4" aria-hidden="true" />{busy ? "Sending..." : "Send test email"}</button><span className="text-xs text-[var(--text-muted)]">{TEMPORARY_EMAIL_SUBJECT}</span></div>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="mt-3 text-sm text-emerald-600">{message}</p>}
      </form>
      <iframe title="Dummy report email preview" sandbox="" srcDoc={renderTemporaryTestEmail()} className="mt-5 h-[78vh] min-h-[480px] w-full border border-[var(--border)] bg-white" />
    </main>
  );
}