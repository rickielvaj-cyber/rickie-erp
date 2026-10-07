"use client";

import { useState } from "react";

type Copied = "summary" | "plan" | "all" | null;

// Dua kolom teks yang bisa diedit bebas lalu disalin ke YonWork. Perubahan hanya
// ada di halaman ini (tidak disimpan); pindah minggu atau "Reset" memuat ulang dari template.
export function SummaryEditor({ summaryText, planText }: { summaryText: string; planText: string }) {
  const [summary, setSummary] = useState(summaryText);
  const [plan, setPlan] = useState(planText);
  const [copied, setCopied] = useState<Copied>(null);

  const edited = summary !== summaryText || plan !== planText;

  async function copy(which: Exclude<Copied, null>) {
    const text = which === "summary" ? summary : which === "plan" ? plan : `${summary}\n\n${plan}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Salin manual (Ctrl+C lalu Enter):", text);
    }
  }

  const area =
    "mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 font-mono text-sm leading-relaxed focus:border-foreground focus:outline-none";
  const button =
    "rounded-full border border-foreground px-4 py-1.5 text-sm font-medium transition-colors hover:bg-surface";

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="summary-text" className="text-xl font-semibold tracking-tight">
            Summary of This Week
          </label>
          <button type="button" onClick={() => copy("summary")} className={button}>
            {copied === "summary" ? "Tersalin!" : "Copy"}
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
            {copied === "plan" ? "Tersalin!" : "Copy"}
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">Terisi dari tugas yang belum selesai. Tambahkan rencana lain langsung di sini.</p>
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
          onClick={() => copy("all")}
          className="rounded-full bg-accent px-5 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {copied === "all" ? "Tersalin!" : "Copy semua"}
        </button>
        {edited && (
          <button
            type="button"
            onClick={() => {
              setSummary(summaryText);
              setPlan(planText);
            }}
            className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
          >
            Reset ke template
          </button>
        )}
        <span className="text-sm text-muted">Hasil edit tidak disimpan; salin dulu sebelum pindah halaman.</span>
      </div>
    </div>
  );
}
