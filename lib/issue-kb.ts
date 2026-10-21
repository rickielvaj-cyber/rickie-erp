import { MODULE_LABELS, isKbModuleSlug, type KbModuleSlug } from "@/lib/kb/modules";

// Issue -> entri Knowledge Base. Murni (tanpa database) supaya mudah diuji.
// KB ikut diindeks ke Gemini untuk pencarian, sedangkan issue dan klien sengaja TIDAK. Karena itu draf di sini
// tidak memuat nama klien maupun proyek; isi deskripsi tetap ditulis sendiri oleh pengguna, jadi formulir
// mengingatkan untuk memeriksanya.

// Kolom Module di issue adalah teks bebas (saran: ISSUE_MODULE_SUGGESTIONS). Hanya yang jelas dipetakan ke bab;
// sisanya (Tax, Cash & Bank, UI Template, ...) ke Bab 15 Troubleshooting.
const MODULE_TO_CHAPTER: Record<string, KbModuleSlug> = {
  "general ledger": "gl",
  "accounts payable": "ap",
  "accounts receivable": "ar",
  purchasing: "purchasing",
  sales: "sales",
  inventory: "inventory",
  "fixed asset": "fixed-assets",
  expense: "expense-service",
  "master data": "master-data",
};

export const DEFAULT_KB_MODULE: KbModuleSlug = "troubleshooting";

export function suggestKbModule(issueModule: string | null): KbModuleSlug {
  return MODULE_TO_CHAPTER[issueModule?.trim().toLowerCase() ?? ""] ?? DEFAULT_KB_MODULE;
}

export type IssueForKb = {
  title: string;
  module: string | null;
  category: string | null;
  description: string;
  root_cause: string | null;
  resolution: string | null;
};

/** Hanya issue yang sudah punya penyebab atau solusi yang layak jadi catatan KB. */
export function canBecomeKbEntry(issue: Pick<IssueForKb, "root_cause" | "resolution">): boolean {
  return Boolean(issue.root_cause?.trim() || issue.resolution?.trim());
}

/** Draf entri: judul + markdown (Masalah / Penyebab / Solusi). Bagian kosong dilewati. Tanpa klien dan proyek. */
export function buildKbDraft(issue: IssueForKb): { title: string; content: string } {
  const meta = [issue.module?.trim(), issue.category?.trim()].filter(Boolean).join(" · ");
  const sections: [string, string | null][] = [
    ["Masalah", issue.description],
    ["Penyebab", issue.root_cause],
    ["Solusi", issue.resolution],
  ];
  const parts: string[] = [];
  if (meta) parts.push(`**${meta}**`);
  for (const [heading, text] of sections) {
    if (text?.trim()) parts.push(`### ${heading}\n${text.trim()}`);
  }
  return { title: issue.title.trim(), content: parts.join("\n\n") };
}

export type KbModuleChoice = { slug: KbModuleSlug; label: string };

export function kbModuleChoices(): KbModuleChoice[] {
  return (Object.entries(MODULE_LABELS) as [KbModuleSlug, string][]).map(([slug, label]) => ({ slug, label }));
}

export { isKbModuleSlug };
