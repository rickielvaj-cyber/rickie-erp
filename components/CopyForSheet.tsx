"use client";

import { useState } from "react";

type Which = "dg" | "kl";

// Dua tombol karena kolom H–J (isi manual) dan Q–R (formula) ada di antara keenam kolom:
//   D–G -> tempel di sel D baris itu, K–L -> tempel di sel K baris yang sama.
// Teks disiapkan di server (lib/sheet.ts) supaya format kutip/baris-baru selalu sama.
export function CopyForSheet({ dg, kl }: { dg: string; kl: string }) {
  const [copied, setCopied] = useState<Which | null>(null);

  async function copy(which: Which) {
    const text = which === "dg" ? dg : kl;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy manually (Ctrl+C, then Enter):", text);
    }
  }

  const button =
    "rounded-full border border-foreground px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => copy("dg")} className={button}>
        {copied === "dg" ? "Copied!" : "Copy D–G"}
      </button>
      <button type="button" onClick={() => copy("kl")} className={button}>
        {copied === "kl" ? "Copied!" : "Copy K–L"}
      </button>
      <span className="text-xs text-muted">
        Client, Module, Category, Description → paste in cell D · Root Cause, Action → paste in cell K
      </span>
    </div>
  );
}
