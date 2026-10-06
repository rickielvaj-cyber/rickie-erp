import type { KbModuleSlug } from "@/lib/kb/modules";

// Urutan baca yang direkomendasikan — terpisah dari urutan KB_MODULES (yang
// tetap dipakai grid "Semua Bab"). Dipakai buat flow diagram di /knowledge-base
// dan link prev/next di halaman bab.

// "Mulai di sini" — tampil di atas Langkah 1, bukan langkah bernomor.
export const KB_START_HERE: KbModuleSlug = "pengantar";

// Tiap elemen = satu langkah bernomor. Langkah dengan >1 bab = bab paralel
// (saling independen, boleh dibaca urutan mana pun sebelum lanjut).
export const KB_STEPS: KbModuleSlug[][] = [
  ["fondasi-erp"],
  ["digital-modeling"],
  ["master-data"],
  ["accounting-common"],
  ["purchasing", "sales"],
  ["inventory"],
  ["inventory-accounting"],
  ["ap", "ar"],
  ["gl"],
  ["fixed-assets", "expense-service"],
  ["enterprise-report"],
];

// Referensi lintas bab — bukan bagian dari urutan baca, nggak punya prev/next.
export const KB_REFERENCE: KbModuleSlug[] = ["troubleshooting", "studi-kasus", "lampiran"];

// Urutan linear buat prev/next: Pengantar, lalu tiap langkah; bab paralel
// diurutkan sesuai posisinya di dalam langkah (= urutan Bab).
const READING_ORDER: KbModuleSlug[] = [KB_START_HERE, ...KB_STEPS.flat()];

export const KB_MODULE_ICONS: Record<KbModuleSlug, string> = {
  "pengantar": "🚩",
  "fondasi-erp": "🏛️",
  "digital-modeling": "🧩",
  "master-data": "🗂️",
  "accounting-common": "🧮",
  "purchasing": "🛒",
  "sales": "🧾",
  "inventory": "📦",
  "inventory-accounting": "⚖️",
  "ap": "💸",
  "ar": "💰",
  "gl": "📒",
  "fixed-assets": "🏢",
  "expense-service": "🧳",
  "enterprise-report": "📊",
  "troubleshooting": "🛠️",
  "studi-kasus": "💼",
  "lampiran": "📎",
};

export type KbChapterPosition =
  | { kind: "start" }
  | { kind: "step"; step: number; totalSteps: number; parallel: boolean }
  | { kind: "reference" };

export function kbChapterPosition(slug: KbModuleSlug): KbChapterPosition {
  if (slug === KB_START_HERE) return { kind: "start" };
  const stepIndex = KB_STEPS.findIndex((step) => step.includes(slug));
  if (stepIndex >= 0) {
    return {
      kind: "step",
      step: stepIndex + 1,
      totalSteps: KB_STEPS.length,
      parallel: KB_STEPS[stepIndex].length > 1,
    };
  }
  return { kind: "reference" };
}

// null = bab referensi (nggak ada di urutan baca).
export function kbPrevNext(
  slug: KbModuleSlug,
): { prev: KbModuleSlug | null; next: KbModuleSlug | null } | null {
  const index = READING_ORDER.indexOf(slug);
  if (index < 0) return null;
  return {
    prev: READING_ORDER[index - 1] ?? null,
    next: READING_ORDER[index + 1] ?? null,
  };
}
