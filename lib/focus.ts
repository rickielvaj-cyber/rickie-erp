import { addDaysISO, mondayOfISO } from "@/lib/date";

// Pomodoro (timer fokus) dan poin. Murni (tanpa jaringan/penyimpanan) supaya mudah diuji.
// Aturan: sesi fokus yang SELESAI = POINTS_PER_SESSION poin. Sesi yang dihentikan di tengah tidak dihitung.
// Timer yang sedang berjalan hanya hidup di browser (localStorage); hanya sesi selesai yang disimpan di database.

export const POINTS_PER_SESSION = 10;
export const FOCUS_CHOICES = [15, 25, 45, 60] as const;
export const DEFAULT_FOCUS = 25;
export const SHORT_BREAK = 5;
export const LONG_BREAK = 15;
/** Setiap sesi ke-4 pada hari yang sama diikuti istirahat panjang. */
export const LONG_BREAK_EVERY = 4;
/** Halaman dibuka lagi sampai sekian ms setelah timer habis: sesinya tetap dihitung. Lebih lama = dianggap tidak diselesaikan di depan layar. */
export const GRACE_MS = 15 * 60_000;
const SKEW_MS = 60_000;
export const LABEL_MAX = 80;

export type TimerState =
  | { phase: "focus"; startedAt: number; endsAt: number; minutes: number; label: string }
  | { phase: "break"; startedAt: number; endsAt: number; minutes: number }
  | { phase: "done"; minutes: number; label: string; points: number; at: number; sessionsToday?: number; error?: string }
  | { phase: "expired"; minutes: number; at: number };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Baca status timer dari localStorage (tidak dipercaya: bisa rusak atau diubah). null = tidak ada timer. */
export function parseTimerState(raw: string | null): TimerState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    const label = typeof s.label === "string" ? s.label.slice(0, LABEL_MAX) : "";
    if (s.phase === "focus" && isNum(s.startedAt) && isNum(s.endsAt) && isNum(s.minutes) && s.endsAt > s.startedAt) {
      return { phase: "focus", startedAt: s.startedAt, endsAt: s.endsAt, minutes: s.minutes, label };
    }
    if (s.phase === "break" && isNum(s.startedAt) && isNum(s.endsAt) && isNum(s.minutes) && s.endsAt > s.startedAt) {
      return { phase: "break", startedAt: s.startedAt, endsAt: s.endsAt, minutes: s.minutes };
    }
    if (s.phase === "done" && isNum(s.minutes) && isNum(s.points) && isNum(s.at)) {
      return {
        phase: "done",
        minutes: s.minutes,
        label,
        points: s.points,
        at: s.at,
        ...(isNum(s.sessionsToday) ? { sessionsToday: s.sessionsToday } : {}),
        ...(typeof s.error === "string" ? { error: s.error.slice(0, 200) } : {}),
      };
    }
    if (s.phase === "expired" && isNum(s.minutes) && isNum(s.at)) return { phase: "expired", minutes: s.minutes, at: s.at };
  } catch {
    /* rusak: anggap tidak ada */
  }
  return null;
}

/** Detik tersisa, dibulatkan ke atas (00:01 tetap terlihat sampai benar-benar habis), tidak negatif. */
export const remainingSeconds = (endsAt: number, now: number): number => Math.max(0, Math.ceil((endsAt - now) / 1000));

/** "25:00", "04:07"; sampai 99 menit. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Timer fokus yang sudah habis: dicatat (masih dalam masa tenggang) atau dibuang (terlalu lama tidak dibuka). Belum habis = running. */
export function focusOutcome(endsAt: number, now: number): "running" | "record" | "discard" {
  if (now < endsAt) return "running";
  return now - endsAt <= GRACE_MS ? "record" : "discard";
}

/** Lama istirahat setelah sesi fokus ke-`sessionsToday` pada hari ini (sudah termasuk sesi yang baru selesai). */
export const breakMinutes = (sessionsToday: number): number => (sessionsToday > 0 && sessionsToday % LONG_BREAK_EVERY === 0 ? LONG_BREAK : SHORT_BREAK);

export type FocusInput = { startedAt: string; minutes: number; label: string };

/**
 * Validasi sesi dari browser (tidak dipercaya): lama harus salah satu pilihan, sesi harus SUDAH selesai (server tidak mau
 * memberi poin untuk sesi yang belum berjalan penuh) dan selesainya tidak lebih lama dari masa tenggang.
 */
export function parseFocusInput(raw: unknown, now: number): { ok: true; value: FocusInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const minutes = r.minutes;
  if (typeof minutes !== "number" || !(FOCUS_CHOICES as readonly number[]).includes(minutes)) return { ok: false, error: "Unknown session length." };
  const startedAtMs = typeof r.startedAt === "string" ? Date.parse(r.startedAt) : NaN;
  if (Number.isNaN(startedAtMs)) return { ok: false, error: "Unknown start time." };
  const endMs = startedAtMs + minutes * 60_000;
  if (endMs > now + SKEW_MS) return { ok: false, error: "That session has not finished yet." };
  if (now - endMs > GRACE_MS + SKEW_MS) return { ok: false, error: "That session ended too long ago to count." };
  const label = typeof r.label === "string" ? r.label.replace(/\s+/g, " ").trim().slice(0, LABEL_MAX) : "";
  return { ok: true, value: { startedAt: new Date(startedAtMs).toISOString(), minutes, label } };
}

/** Tanggal WIB (YYYY-MM-DD) dari instan ISO. */
export const wibDate = (iso: string): string => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export type SessionRow = { started_at: string; minutes: number; points: number };
export type Totals = { sessions: number; minutes: number; points: number };
export type FocusSummary = { today: Totals; week: Totals; total: Totals; days: { date: string; sessions: number }[] };

const empty = (): Totals => ({ sessions: 0, minutes: 0, points: 0 });
const add = (t: Totals, r: SessionRow) => {
  t.sessions += 1;
  t.minutes += r.minutes;
  t.points += r.points;
};

/** Ringkasan: hari ini, minggu ini (Senin–Minggu), semuanya, dan jumlah sesi 7 hari terakhir (hari ini paling kanan). Semua menurut tanggal WIB. */
export function summarizeSessions(rows: SessionRow[], today: string): FocusSummary {
  const weekStart = mondayOfISO(today);
  const weekEnd = addDaysISO(weekStart, 6);
  const summary: FocusSummary = {
    today: empty(),
    week: empty(),
    total: empty(),
    days: Array.from({ length: 7 }, (_, i) => ({ date: addDaysISO(today, i - 6), sessions: 0 })),
  };
  const byDay = new Map(summary.days.map((d) => [d.date, d]));
  for (const r of rows) {
    const date = wibDate(r.started_at);
    add(summary.total, r);
    if (date === today) add(summary.today, r);
    if (date >= weekStart && date <= weekEnd) add(summary.week, r);
    const day = byDay.get(date);
    if (day) day.sessions += 1;
  }
  return summary;
}

/** Posisi tombol timer melayang: sisi layar (kiri/kanan) dan tinggi sebagai pecahan 0..1 dari tinggi layar. */
export type FabPos = { side: "l" | "r"; frac: number };
export const DEFAULT_FAB_POS: FabPos = { side: "r", frac: 0.78 };
export const FAB_FRAC_MIN = 0.12;
export const FAB_FRAC_MAX = 0.92;

export const clampFabFrac = (v: number): number => Math.min(FAB_FRAC_MAX, Math.max(FAB_FRAC_MIN, v));

/** Baca posisi dari localStorage (tidak dipercaya): rusak atau di luar batas -> bawaan / dijepit ke batas. */
export function parseFabPos(raw: string | null): FabPos {
  if (!raw) return DEFAULT_FAB_POS;
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    if ((s.side === "l" || s.side === "r") && isNum(s.frac)) return { side: s.side, frac: clampFabFrac(s.frac) };
  } catch {
    /* rusak: pakai bawaan */
  }
  return DEFAULT_FAB_POS;
}

/** Posisi akhir setelah menyeret: menempel ke sisi layar terdekat dari titik tengah tombol; tinggi dijepit. */
export function snapFabPos(centerX: number, centerY: number, viewportW: number, viewportH: number): FabPos {
  if (!(viewportW > 0) || !(viewportH > 0)) return DEFAULT_FAB_POS;
  return { side: centerX < viewportW / 2 ? "l" : "r", frac: clampFabFrac(centerY / viewportH) };
}
