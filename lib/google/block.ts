import { isISODate } from "@/lib/date";
import { parseReminder, type ReminderChoice } from "./reminder";

// Blok waktu (time block) di grid kalender: hitung menit dari posisi pointer, validasi masukan form, dan ubah jam WIB
// menjadi waktu ISO untuk Google. Semua murni supaya mudah diuji. Zona waktu situs: Asia/Jakarta (UTC+7, tanpa DST).

export const SNAP_MIN = 15;
export const DEFAULT_BLOCK_MIN = 30;
const MAX_MIN = 24 * 60 - 1; // 23:59: input <input type="time"> tidak punya 24:00
export const TITLE_MAX = 200;

export const snapMinutes = (min: number, step = SNAP_MIN) => Math.round(min / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function minutesToTime(min: number): string {
  const m = clamp(Math.round(min), 0, MAX_MIN);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "HH:MM" -> menit sejak 00:00, atau null bila bukan jam yang valid. */
export function timeToMinutes(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** Posisi vertikal di kolom hari (piksel dari atas, dari tinggi kolom) -> menit sejak 00:00, dibulatkan ke kelipatan 15. */
export function slotFromOffset(offsetPx: number, columnHeightPx: number, startHour: number, endHour: number): number {
  if (columnHeightPx <= 0) return startHour * 60;
  const raw = startHour * 60 + (offsetPx / columnHeightPx) * (endHour - startHour) * 60;
  return clamp(snapMinutes(raw), 0, MAX_MIN);
}

/** Dua titik seret -> rentang berurutan. Klik tanpa seret (atau seret terlalu pendek) = blok 30 menit. */
export function dragRange(a: number, b: number): { startMin: number; endMin: number } {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const end = hi - lo < SNAP_MIN ? lo + DEFAULT_BLOCK_MIN : hi;
  const startMin = Math.min(lo, MAX_MIN - SNAP_MIN);
  return { startMin, endMin: clamp(end, startMin + SNAP_MIN, MAX_MIN) };
}

/** Tanggal + menit WIB -> waktu ISO dengan offset +07:00 (diterima Google apa adanya). */
export function wibIso(date: string, minutes: number): string {
  return `${date}T${minutesToTime(minutes)}:00+07:00`;
}

export type BlockInput = { date: string; startMin: number; endMin: number; title: string; reminder?: ReminderChoice };

/** Validasi masukan dari form (server action): tidak percaya data dari browser. */
export function parseBlockInput(raw: unknown): { ok: true; value: BlockInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim() : "";
  const date = typeof r.date === "string" ? r.date : "";
  const startMin = typeof r.start === "string" ? timeToMinutes(r.start) : null;
  const endMin = typeof r.end === "string" ? timeToMinutes(r.end) : null;
  if (!title) return { ok: false, error: "Give the block a title." };
  if (title.length > TITLE_MAX) return { ok: false, error: `The title is too long (max ${TITLE_MAX} characters).` };
  if (!isISODate(date)) return { ok: false, error: "Choose a valid date." };
  if (startMin === null || endMin === null) return { ok: false, error: "Choose a valid start and end time." };
  if (endMin <= startMin) return { ok: false, error: "The end time must be after the start time." };
  // Tanpa bidang reminder = jangan mengubah pengingat yang sudah ada.
  const reminder = r.reminder === undefined || r.reminder === "" ? undefined : parseReminder(r.reminder);
  if (reminder === null) return { ok: false, error: "Choose a valid reminder." };
  return { ok: true, value: { date, startMin, endMin, title, ...(reminder !== undefined ? { reminder } : {}) } };
}

const EVENT_ID = /^[A-Za-z0-9_-]{1,1024}$/;
export const isEventId = (v: unknown): v is string => typeof v === "string" && EVENT_ID.test(v);
