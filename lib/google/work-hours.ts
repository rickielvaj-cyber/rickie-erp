// Jam kerja = latar kalender (bukan acara): jam di luar jam kerja diberi warna abu, jam kerja tetap putih. Karena hanya latar, blok bisa
// dibuat/diseret di atas jam kerja seperti di Google Calendar. Disimpan di browser (tanpa migrasi): tiap perangkat punya pengaturannya.

import { timeToMinutes } from "./block";

export type WorkHours = { enabled: boolean; startMin: number; endMin: number; /** 0 = Senin ... 6 = Minggu */ days: number[] };

export const WORK_HOURS_KEY = "work-hours-v1";
export const DEFAULT_WORK_HOURS: WorkHours = { enabled: true, startMin: 9 * 60, endMin: 17 * 60, days: [0, 1, 2, 3, 4] };

/** Baca nilai tersimpan (JSON) dengan aman; apa pun yang rusak menjadi bawaan. */
export function parseWorkHours(raw: string | null | undefined): WorkHours {
  if (!raw) return DEFAULT_WORK_HOURS;
  try {
    const v = JSON.parse(raw) as Partial<WorkHours> | null;
    if (!v || typeof v !== "object") return DEFAULT_WORK_HOURS;
    const startMin = Number.isInteger(v.startMin) ? (v.startMin as number) : DEFAULT_WORK_HOURS.startMin;
    const endMin = Number.isInteger(v.endMin) ? (v.endMin as number) : DEFAULT_WORK_HOURS.endMin;
    if (startMin < 0 || endMin > 24 * 60 || endMin <= startMin) return DEFAULT_WORK_HOURS;
    const days = Array.isArray(v.days) ? Array.from(new Set(v.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))).sort() : DEFAULT_WORK_HOURS.days;
    return { enabled: v.enabled !== false, startMin, endMin, days };
  } catch {
    return DEFAULT_WORK_HOURS;
  }
}

/** Dari dua isian "HH:MM"; null bila tidak valid atau selesai <= mulai. */
export function workHoursFromInputs(start: string, end: string, days: number[], enabled: boolean): WorkHours | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null || e <= s) return null;
  return { enabled, startMin: s, endMin: e, days: Array.from(new Set(days.filter((d) => d >= 0 && d <= 6))).sort() };
}

/** Hari dalam minggu (0 = Senin) dari tanggal YYYY-MM-DD. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Rentang menit yang diberi warna abu pada satu hari: seluruh hari bila bukan hari kerja, selain itu sebelum mulai dan sesudah selesai.
 * Kosong bila jam kerja dimatikan.
 */
export function shadedRanges(date: string, wh: WorkHours): Array<{ from: number; to: number }> {
  if (!wh.enabled) return [];
  if (!wh.days.includes(weekdayIndex(date))) return [{ from: 0, to: 24 * 60 }];
  const out: Array<{ from: number; to: number }> = [];
  if (wh.startMin > 0) out.push({ from: 0, to: wh.startMin });
  if (wh.endMin < 24 * 60) out.push({ from: wh.endMin, to: 24 * 60 });
  return out;
}
