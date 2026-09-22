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

export function formatDateID(isoDate: string | null): string {
  if (!isoDate) return "-";
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
