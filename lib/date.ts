function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday..Sunday range containing `reference`. */
export function currentWeekRange(reference = new Date()): { start: string; end: string } {
  const day = reference.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = startOfDay(reference);
  monday.setDate(monday.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  return { start: toISODate(monday), end: toISODate(sunday) };
}

/** Rolling 7-day window ending today. */
export function last7DaysRange(reference = new Date()): { start: string; end: string } {
  const end = startOfDay(reference);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  return { start: toISODate(start), end: toISODate(end) };
}

export function nextWeekRange(reference = new Date()): { start: string; end: string } {
  const { start: thisMonday } = currentWeekRange(reference);
  const start = new Date(thisMonday);
  start.setDate(start.getDate() + 7);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return { start: toISODate(start), end: toISODate(end) };
}

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

function formatISO(iso: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("id-ID", { timeZone: "UTC", ...options });
}

/** "Selasa, 7 Oktober" */
export const formatLongDayID = (iso: string) => formatISO(iso, { weekday: "long", day: "numeric", month: "long" });
/** "Sen" */
export const formatWeekdayShortID = (iso: string) => formatISO(iso, { weekday: "short" });
/** "7 Okt" */
export const formatDayMonthID = (iso: string) => formatISO(iso, { day: "numeric", month: "short" });

export function formatDateID(isoDate: string | null): string {
  if (!isoDate) return "-";
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
