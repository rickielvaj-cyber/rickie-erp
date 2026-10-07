// Pembantu Export: ambil SEMUA baris (PostgREST membatasi 1000 baris per permintaan)
// dan bangun CSV yang aman dibuka di Excel / Google Sheets.

const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Ambil semua baris halaman demi halaman. `page` harus memakai urutan yang stabil (mis. created_at lalu id). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}

/**
 * Satu sel CSV (RFC 4180). Sel yang diawali = + - @ (atau tab/CR) diberi awalan ' supaya
 * tidak dibaca sebagai rumus oleh Excel/Sheets ("CSV injection"); teks dari klien bisa
 * saja berisi hal seperti =HYPERLINK(...).
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(columns: { key: keyof T & string; label: string }[], rows: T[]) {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(","));
  // CRLF + BOM UTF-8: Excel membaca huruf non-ASCII dengan benar.
  return "﻿" + [header, ...body].join("\r\n") + "\r\n";
}
