"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWeeklySummary, saveWeeklySummary } from "@/app/(dashboard)/summary/actions";

type Copied = "summary" | "plan" | "all" | null;

type Saved = { summary: string; plan: string; savedAt: string };

// Dua kolom teks yang bisa diedit bebas, disimpan per minggu (tombol Save), lalu disalin ke YonWork.
// Tanpa Save, perubahan hanya ada di halaman ini; "Reset to template" mengembalikan teks dari data minggu itu.
export function SummaryEditor({
  weekStart,
  summaryText,
  planText,
  saved,
}: {
  weekStart: string;
  /** Template dari data minggu itu (selalu dihitung ulang). */
  summaryText: string;
  planText: string;
  /** Teks yang tersimpan; bila ada dan tidak sedang "fresh", itulah isi awal editor. */
  saved: Saved | null;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(saved?.summary ?? summaryText);
  const [plan, setPlan] = useState(saved?.plan ?? planText);
  const [baseline, setBaseline] = useState<Saved | null>(saved);
  const [copied, setCopied] = useState<Copied>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Belum disimpan = beda dari yang tersimpan; kalau belum pernah disimpan, beda dari template.
  const dirty = baseline ? summary !== baseline.summary || plan !== baseline.plan : summary !== summaryText || plan !== planText;
  const differsFromTemplate = summary !== summaryText || plan !== planText;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function copy(which: Exclude<Copied, null>) {
    const text = which === "summary" ? summary : which === "plan" ? plan : `${summary}\n\n${plan}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy manually (Ctrl+C, then Enter):", text);
    }
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveWeeklySummary({ weekStart, summary, plan });
      if (result.ok) {
        setBaseline({ summary, plan, savedAt: result.savedAt });
        setMessage({ ok: true, text: "Saved." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  function removeSaved() {
    if (!window.confirm("Delete the saved text for this week? The tasks and issues themselves are not touched.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deleteWeeklySummary(weekStart);
      if (result.ok) {
        setBaseline(null);
        setSummary(summaryText);
        setPlan(planText);
        setMessage({ ok: true, text: "Saved text deleted." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error ?? "Could not delete." });
      }
    });
  }

  const area =
    "mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 font-mono text-sm leading-relaxed focus:border-foreground focus:outline-none";
  const button =
    "rounded-full border border-foreground px-4 py-1.5 text-sm font-medium transition-colors hover:bg-surface";
  const link = "text-sm text-muted underline underline-offset-4 hover:text-foreground";

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted" role="status">
        {dirty
          ? "Unsaved changes."
          : baseline
            ? `Saved ${new Date(baseline.savedAt).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} WIB.`
            : "Not saved yet. Press Save to keep this week in the history."}
      </p>

      <section>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="summary-text" className="text-xl font-semibold tracking-tight">
            Summary of This Week
          </label>
          <button type="button" onClick={() => copy("summary")} className={button}>
            {copied === "summary" ? "Copied!" : "Copy"}
          </button>
        </div>
        <textarea
          id="summary-text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={Math.min(24, Math.max(8, summary.split("\n").length + 1))}
          className={area}
        />
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="plan-text" className="text-xl font-semibold tracking-tight">
            Next Week Plan
          </label>
          <button type="button" onClick={() => copy("plan")} className={button}>
            {copied === "plan" ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">Filled from unfinished tasks. Add other plans right here.</p>
        <textarea
          id="plan-text"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          rows={Math.min(24, Math.max(6, plan.split("\n").length + 2))}
          className={area}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-full bg-accent px-5 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : baseline && !dirty ? "Saved" : "Save"}
        </button>
        <button type="button" onClick={() => copy("all")} className={button}>
          {copied === "all" ? "Copied!" : "Copy all"}
        </button>
        {differsFromTemplate && (
          <button
            type="button"
            onClick={() => {
              setSummary(summaryText);
              setPlan(planText);
            }}
            className={link}
          >
            Reset to template
          </button>
        )}
        {baseline && (
          <button type="button" onClick={removeSaved} disabled={pending} className={link}>
            Delete saved text
          </button>
        )}
        {message && (
          <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-muted" : "text-danger"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
