"use client";

import { useState } from "react";

export function CopySummaryButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Salin manual (Ctrl+C lalu Enter):", text);
        }
      }}
      className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-red-dark"
    >
      {copied ? "Tersalin!" : "Copy sebagai teks"}
    </button>
  );
}
