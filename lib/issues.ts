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

// Saran modul untuk kolom Module (kolom E di sheet). Hanya saran (datalist), bukan batasan:
// 10 modul dari dropdown sheet "Lists" ditambah dua yang dipakai di baris tracker
// (Master Data, UI Template). Perlu dicocokkan dengan sheet "Lists" yang sebenarnya.
export const ISSUE_MODULE_SUGGESTIONS = [
  "General Ledger",
  "Accounts Payable",
  "Accounts Receivable",
  "Cash & Bank",
  "Purchasing",
  "Sales",
  "Inventory",
  "Fixed Asset",
  "Tax",
  "Expense",
  "Master Data",
  "UI Template",
] as const;

/** Judul internal bila kosong: kalimat pertama deskripsi, dipotong 80 karakter. */
export function defaultIssueTitle(description: string): string {
  const firstLine = description.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  const text = firstLine.trim().replace(/\s+/g, " ");
  return text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text;
}

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
