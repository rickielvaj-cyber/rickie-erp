// Pembuat teks "Copy for Sheet" untuk YS_Issue_Tracker (sheet milik Willy, dipakai bersama).
//
// Hanya 6 kolom yang diisi dari website. Q (Aging) dan R (SLA Status) di sheet adalah
// formula dan kolom H–J diisi manual, jadi hasil salinan dibagi dua segmen yang masing-masing
// berdampingan di sheet:
//   D–G : Client, Module, Issue Category, Issue Description   (tempel di sel D baris itu)
//   K–L : Root Cause, Action / Resolution                      (tempel di sel K baris itu)
// Format: TSV (tab antar sel). Sel yang berisi tab, baris baru, atau tanda kutip dibungkus
// "…" dengan tanda kutip digandakan, supaya teks multi-baris tetap satu sel saat ditempel.

export type SheetIssue = {
  client_name: string | null;
  module: string | null;
  category: string | null;
  description: string;
  root_cause: string | null;
  resolution: string | null;
};

/**
 * Teks yang diawali = + @ (atau "-" diikuti angka/kurung/$/=/.) bisa dibaca Sheets sebagai
 * rumus. Diberi awalan ' (penanda teks di Sheets) — sama dengan perlindungan di Export CSV.
 * Teks biasa seperti "- cek voucher" tidak disentuh.
 */
function guardFormula(text: string): string {
  return /^(?:[=+@]|-[\d($=.])/.test(text) ? `'${text}` : text;
}

export function sheetCell(value: string | null | undefined): string {
  let text = (value ?? "").replace(/\r\n?/g, "\n").trim();
  text = guardFormula(text);
  return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toTsvRow(cells: (string | null | undefined)[]): string {
  return cells.map(sheetCell).join("\t");
}

/** Kolom D–G. `clientName` harus nama kanonik (persis Sheet1). */
export function sheetSegmentDG(issue: SheetIssue, clientName: string | null = issue.client_name): string {
  return toTsvRow([clientName, issue.module, issue.category, issue.description]);
}

/** Kolom K–L. */
export function sheetSegmentKL(issue: SheetIssue): string {
  return toTsvRow([issue.root_cause, issue.resolution]);
}
