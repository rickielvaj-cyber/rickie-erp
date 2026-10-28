import { addDaysISO, isISODate, mondayOfISO } from "@/lib/date";

// Riwayat Weekly Summary: validasi simpan, ringkasan angka dari teks tersimpan, dan pengelompokan per bulan. Murni.

export const SUMMARY_MAX_CHARS = 50_000;

export type SaveInput = { weekStart: string; summary: string; plan: string };

/** Masukan simpan dari browser (tidak dipercaya): kunci minggu harus hari Senin yang valid; teks dibatasi panjangnya. */
export function parseSaveInput(raw: unknown): { ok: true; value: SaveInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const weekStart = typeof r.weekStart === "string" ? r.weekStart : "";
  if (!isISODate(weekStart) || mondayOfISO(weekStart) !== weekStart) return { ok: false, error: "Unknown week." };
  if (typeof r.summary !== "string" || typeof r.plan !== "string") return { ok: false, error: "Nothing to save." };
  const summary = r.summary.replace(/\r\n/g, "\n");
  const plan = r.plan.replace(/\r\n/g, "\n");
  if (summary.trim() === "") return { ok: false, error: "The summary is empty." };
  if (summary.length > SUMMARY_MAX_CHARS || plan.length > SUMMARY_MAX_CHARS) return { ok: false, error: "The text is too long to save." };
  return { ok: true, value: { weekStart, summary, plan } };
}

export type SummaryStats = { tasks: number | null; issues: number | null; blocked: string | null };

/** Angka dari judul bagian teks ("Tasks completed (12)", "Issues handled (3)", "Time blocked (6 h 30 m)"). Tidak ketemu = null. */
export function statsFromSummaryText(text: string): SummaryStats {
  const num = (label: string) => {
    const m = new RegExp(`^${label} \\((\\d+)\\)\\s*$`, "m").exec(text);
    return m ? Number(m[1]) : null;
  };
  const blocked = /^Time blocked \(([^)]+)\)\s*$/m.exec(text);
  return { tasks: num("Tasks completed"), issues: num("Issues handled"), blocked: blocked ? blocked[1] : null };
}

export type HistoryRow = { week_start: string; summary_text: string; updated_at: string };

/** Kelompokkan per bulan (menurut hari Jumat minggu itu, supaya minggu lintas bulan masuk bulan tempat kerjanya paling banyak). Terbaru dulu. */
export function groupByMonth<T extends { week_start: string }>(rows: T[]): { month: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const month = addDaysISO(row.week_start, 4).slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), row]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => ({ month, rows: [...list].sort((a, b) => b.week_start.localeCompare(a.week_start)) }));
}
