"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DEMO_MEMO } from "@/lib/demoMemo";

export default function NewThesisPage() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [cik, setCik] = useState("");
  const [memo, setMemo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ticker.trim()) return setError("Ticker is required.");
    if (!file && !memo.trim()) return setError("Paste a memo or upload a file.");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("ticker", ticker.trim());
      if (cik.trim()) form.set("cik", cik.trim());
      form.set("memo", memo);
      if (file) form.set("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const body = (await res.json()) as { thesisId?: string; error?: string; details?: string[] };
      if (!res.ok || !body.thesisId) {
        setError([body.error ?? "Extraction failed.", ...(body.details ?? [])].join(" "));
        return;
      }
      router.push(`/thesis/${body.thesisId}/review`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">New thesis</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Paste a memo or upload a PDF or DOCX. You get a draft to review; nothing is tracked until you
          confirm each assumption.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-ink-muted">Ticker (US-listed)</span>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-ink"
            placeholder="NVDA"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-muted">SEC CIK (optional, used for EDGAR checks)</span>
          <input
            value={cik}
            onChange={(e) => setCik(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-ink"
            placeholder="1045810"
          />
        </label>
      </div>

      <label className="block text-sm">
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">Memo</span>
          <button
            type="button"
            onClick={() => setMemo(DEMO_MEMO)}
            className="text-xs text-accent hover:underline"
          >
            Load example memo (fictional)
          </button>
        </div>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={16}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink"
          placeholder="Paste the investment memo here"
        />
      </label>

      <label className="block text-sm">
        <span className="text-ink-muted">Or upload a file (PDF, DOCX, TXT; replaces the pasted text)</span>
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block text-sm text-ink-muted"
        />
      </label>

      {error && <p className="rounded-md bg-contradicted/10 px-3 py-2 text-sm text-contradicted">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {busy ? "Drafting…" : "Draft thesis"}
      </button>
    </form>
  );
}
