// Bagian "Upcoming" di halaman To-Do: to-do terbuka yang jatuh tempo SETELAH hari ini, dikelompokkan per tanggal. Murni supaya mudah diuji.

export type UpcomingGroup<T> = { date: string; label: string; todos: T[] };

const DAY_MS = 86_400_000;

/** Selisih hari kalender (YYYY-MM-DD) dari `from` ke `to`; positif bila `to` sesudah `from`. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** "Tomorrow", "In 4 days", "In 3 weeks" (dari 14 hari). */
export function relativeDay(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n <= 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 14) return `In ${n} days`;
  return `In ${Math.floor(n / 7)} weeks`;
}

/**
 * Kelompokkan per tanggal (naik) hanya to-do yang jatuh tempo setelah `today`. `limit` memotong jumlah to-do yang ikut (urutan tanggal tetap);
 * `total` = jumlah semua yang memenuhi syarat, sebelum dipotong.
 */
export function groupUpcoming<T extends { due_date: string | null }>(
  todos: T[],
  today: string,
  limit: number = Infinity,
  formatDate: (iso: string) => string = (d) => d,
): { groups: UpcomingGroup<T>[]; total: number; shown: number } {
  const future = todos.filter((t): t is T & { due_date: string } => t.due_date !== null && t.due_date > today);
  const sorted = [...future].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
  const picked = sorted.slice(0, Math.max(0, limit));
  const groups: UpcomingGroup<T>[] = [];
  for (const t of picked) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.due_date) last.todos.push(t);
    else groups.push({ date: t.due_date, label: `${formatDate(t.due_date)} · ${relativeDay(t.due_date, today)}`, todos: [t] });
  }
  return { groups, total: sorted.length, shown: picked.length };
}
