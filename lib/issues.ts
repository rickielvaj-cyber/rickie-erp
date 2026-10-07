// Kategori issue — satu-satunya daftar; harus sama dengan CHECK di supabase/migrations/0008.
export const ISSUE_CATEGORIES = [
  "System Issue",
  "User Operation",
  "Master Data",
  "Configuration",
  "Interface",
  "Report",
  "Authorization",
  "Data Issue",
  "Enhancement Request",
  "Other",
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export function isIssueCategory(value: string): value is IssueCategory {
  return (ISSUE_CATEGORIES as readonly string[]).includes(value);
}

/** Hitung kemunculan tiap nilai; null/kosong dikelompokkan ke `emptyLabel`. Urut dari terbanyak. */
export function countBy<T>(rows: T[], pick: (row: T) => string | null, emptyLabel: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row)?.trim() || emptyLabel;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
