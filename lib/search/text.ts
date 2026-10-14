import { createHash } from "node:crypto";
import type { SearchDoc, SearchHit, SearchSourceType } from "./types";

// Model embedding dan dimensinya harus cocok dengan kolom vector(1536) di migrasi 0014.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** Batas panjang teks yang di-embed: cukup untuk menangkap topik, tanpa membawa seluruh isi bab. */
export const EXCERPT_MAX_CHARS = 1500;
export const SNIPPET_MAX_CHARS = 180;

export const QUERY_MIN_CHARS = 2;
export const QUERY_MAX_CHARS = 200;

/** Markdown/HTML -> teks polos satu paragraf (untuk embedding dan cuplikan hasil). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // blok kode / diagram mermaid
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // gambar
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // tautan: pertahankan teksnya
    .replace(/<[^>]+>/g, " ") // tag HTML
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "") // penanda judul
    .replace(/[*_`>|~]+/g, " ") // penanda tebal/miring/tabel/kutipan
    .replace(/^[ \t]*[-+][ \t]+/gm, "") // penanda butir
    .replace(/\s+/g, " ")
    .trim();
}

/** Potong di batas kata (bukan di tengah kata) dan beri "…" bila terpotong. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Gabungkan judul + isi menjadi teks yang di-embed, dipotong wajar. */
export function buildExcerpt(title: string, body: string): string {
  const head = title.trim();
  const rest = plainText(body);
  return truncate(rest ? `${head}. ${rest}` : head, EXCERPT_MAX_CHARS);
}

export function contentHash(doc: Pick<SearchDoc, "title" | "excerpt" | "urlPath">): string {
  return createHash("sha256")
    .update([EMBEDDING_MODEL, doc.title, doc.excerpt, doc.urlPath].join("\u0000"))
    .digest("hex");
}

/** pgvector menerima vektor sebagai teks "[0.1,0.2,...]". */
export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

/** Rapikan query pengguna; null = terlalu pendek untuk dicari. */
export function normalizeQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, QUERY_MAX_CHARS);
  return q.length >= QUERY_MIN_CHARS ? q : null;
}

/** Cuplikan untuk tampilan: excerpt tanpa awalan judul (judul sudah tampil terpisah). */
export function snippetOf(title: string, excerpt: string): string {
  const withoutTitle = excerpt.startsWith(`${title}. `) ? excerpt.slice(title.length + 2) : excerpt;
  return truncate(withoutTitle, SNIPPET_MAX_CHARS);
}

type Ranked = {
  id: string;
  source_type: string;
  title: string;
  content_excerpt: string;
  url_path: string;
};

const RRF_K = 60;

/**
 * Gabungkan dua daftar berperingkat (arti + kata kunci) dengan Reciprocal Rank Fusion:
 * skor = jumlah 1/(60 + peringkat). Hasil yang muncul di kedua daftar naik ke atas,
 * duplikat digabung. Tidak perlu menyamakan skala skor kedua pencarian.
 */
export function mergeRanked(semantic: Ranked[], keyword: Ranked[], limit = 30): SearchHit[] {
  const merged = new Map<string, { row: Ranked; score: number; sem: boolean; kw: boolean }>();
  const add = (rows: Ranked[], kind: "sem" | "kw") => {
    rows.forEach((row, index) => {
      const entry = merged.get(row.id) ?? { row, score: 0, sem: false, kw: false };
      entry.score += 1 / (RRF_K + index + 1);
      if (kind === "sem") entry.sem = true;
      else entry.kw = true;
      merged.set(row.id, entry);
    });
  };
  add(semantic, "sem");
  add(keyword, "kw");

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, sem, kw }) => ({
      id: row.id,
      sourceType: row.source_type as SearchSourceType,
      title: row.title,
      snippet: snippetOf(row.title, row.content_excerpt),
      urlPath: row.url_path,
      match: sem && kw ? "both" : sem ? "semantic" : "keyword",
    }));
}
