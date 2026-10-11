// --- Tanggal kalender (YYYY-MM-DD), dipakai To-Do mingguan ---
// "Hari ini" dihitung di zona Asia/Jakarta, bukan zona server (Vercel = UTC),
// supaya setelah jam 17.00 WIB tugas "hari ini" nggak ikut hari kemarin.
// Semua aritmetika tanggal lewat Date.UTC, jadi nggak kena geser zona waktu.

const APP_TIME_ZONE = "Asia/Jakarta";

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isISODate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Senin dari minggu yang memuat `iso`. */
export function mondayOfISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Minggu
  return addDaysISO(iso, weekday === 0 ? -6 : 1 - weekday);
}

// en-GB menulis September sebagai "Sept"; kita pakai "Sep" seperti bulan lain yang 3 huruf.
const shortSep = (text: string) => text.replace("Sept", "Sep");

function formatISO(iso: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split("-").map(Number);
  return shortSep(new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-GB", { timeZone: "UTC", ...options }));
}

/** "Tuesday 7 October" */
export const formatLongDay = (iso: string) => formatISO(iso, { weekday: "long", day: "numeric", month: "long" });
/** "Mon" */
export const formatWeekdayShort = (iso: string) => formatISO(iso, { weekday: "short" });
/** "7 Oct" */
export const formatDayMonth = (iso: string) => formatISO(iso, { day: "numeric", month: "short" });

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return "-";
  const date = new Date(`${isoDate}T00:00:00`);
  return shortSep(
    date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  );
}

/** "2026-10" -> "Oct 2026" */
export function formatMonthYear(yyyyMm: string): string {
  return formatISO(`${yyyyMm}-01`, { month: "short", year: "numeric" });
}

/** Hari terakhir bulan "YYYY-MM" sebagai YYYY-MM-DD. */
export function endOfMonthISO(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function isYearMonth(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
