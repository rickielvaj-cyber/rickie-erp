"use client";

import { useState } from "react";

// Teks rekap yang bisa diedit lalu disalin; tidak disimpan (rekap selalu bisa dibangun ulang dari data).
export function CopyBox({ text }: { text: string }) {
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy manually (Ctrl+C, then Enter):", value);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="monthly-text" className="text-xl font-semibold tracking-tight">
          Recap
        </label>
        <button type="button" onClick={copy} className="rounded-full border border-foreground px-4 py-1.5 text-sm font-medium transition-colors hover:bg-surface">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <textarea
        id="monthly-text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={Math.min(36, Math.max(10, value.split("\n").length + 1))}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 font-mono text-sm leading-relaxed focus:border-foreground focus:outline-none"
      />
    </div>
  );
}
