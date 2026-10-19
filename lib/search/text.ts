import { createHash } from "node:crypto";
import type { SearchDoc, SearchHit, SearchSourceType } from "./types";

// Model embedding dan dimensinya harus cocok dengan kolom vector(1536) di migrasi 0014. Gemini mendukung
// dimensi keluaran 1536 (outputDimensionality), jadi skema tidak perlu berubah.
export const EMBEDDING_MODEL = "gemini-embedding-001";
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

/** Panjang satu potongan (±400 token; jauh di bawah batas 2.048 token per teks pada Gemini), tumpang tindih, dan batas potongan per entri. */
export const CHUNK_MAX_CHARS = EXCERPT_MAX_CHARS;
export const CHUNK_OVERLAP_CHARS = 150;
export const MAX_CHUNKS_PER_DOC = 8;

/**
 * Pecah judul + isi menjadi satu atau beberapa teks yang di-embed. Konten yang muat dalam satu potongan
 * menghasilkan teks yang sama dengan buildExcerpt (hash lama tetap cocok, tidak perlu embed ulang). Konten panjang
 * dipecah di batas kata dengan sedikit tumpang tindih; tiap potongan diawali judul supaya konteksnya tetap ada.
 * Maksimal MAX_CHUNKS_PER_DOC potongan (±12.000 karakter pertama).
 */
export function buildChunks(title: string, body: string): string[] {
  const head = title.trim();
  const text = plainText(body);
  const full = text ? `${head}. ${text}` : head;
  if (full.length <= CHUNK_MAX_CHARS) return [full];

  const prefix = `${head}. `;
  const size = Math.max(CHUNK_MAX_CHARS - prefix.length, 600);
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length && chunks.length < MAX_CHUNKS_PER_DOC) {
    let end = Math.min(pos + size, text.length);
    if (end < text.length) {
      const space = text.lastIndexOf(" ", end);
      if (space > pos + size * 0.6) end = space;
    }
    const piece = text.slice(pos, end).trim();
    if (piece) chunks.push(prefix + piece);
    if (end >= text.length) break;
    pos = Math.max(end - CHUNK_OVERLAP_CHARS, pos + 1);
    const space = text.indexOf(" ", pos);
    if (space !== -1 && space < end) pos = space + 1;
  }
  return chunks.length ? chunks : [full.slice(0, CHUNK_MAX_CHARS)];
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
  /** Satu konten bisa punya beberapa baris indeks (potongan); hasil digabung per konten lewat (source_type, source_id). */
  source_id?: string;
  source_type: string;
  title: string;
  content_excerpt: string;
  url_path: string;
  /** Hanya untuk hasil arti: kemiripan mentah dan z-score (dari skor tersesuaikan hub) terhadap seluruh indeks. */
  similarity?: number;
  z?: number;
};

export type SemanticRow = Ranked & { similarity: number; adjusted: number; mean_adj: number; sd_adj: number | null };

/**
 * Hasil arti diterima bila LOLOS DUA syarat (disetel dengan angka asli dari /search?debug=1 di produksi):
 *
 * 1. kemiripan mentah >= SEMANTIC_MIN_SIMILARITY. Query yang relevan memberi kemiripan 0,63-0,73 ("how to set up
 *    fixed asset" 0,67-0,72; "费用报销" 0,63-0,67), sedangkan ketikan acak ("asdfgh qwerty zxcv") hanya 0,52-0,58.
 *    Z-score saja tidak bisa memisahkan keduanya: ketikan acak membuat seluruh indeks sama-sama jauh (sd cuma
 *    0,017 berbanding 0,03-0,04), sehingga selisih kecil tampak mencolok (z sampai 6,3 untuk goal "Project Nagiya").
 * 2. z-score >= SEMANTIC_MIN_Z: seberapa mencolok hasil dibanding SELURUH indeks untuk query itu setelah hub
 *    dokumen dikurangkan. Ini membuang "satu topik ERP yang sama-sama mirip" (indeks ini rapat: rata-rata antar-dokumen
 *    0,73). Query relevan yang diuji punya z 2,9-4,1 untuk hasil terbaiknya, jadi 3 dipilih (4 melewatkan
 *    semua hasil "fixed asset").
 *
 * Disetel dari TIGA query nyata; tetap awal yang konservatif. Lihat /search?q=...&debug=1 untuk menyetel ulang.
 */
export const SEMANTIC_MIN_Z = 3;
export const SEMANTIC_MIN_SIMILARITY = 0.61;

/** Z-score satu baris (null bila sebaran tidak berarti). */
export function zOf(row: SemanticRow): number | null {
  return row.sd_adj !== null && row.sd_adj > 1e-6 ? (row.adjusted - row.mean_adj) / row.sd_adj : null;
}

/** Apakah satu hasil arti lolos kedua syarat. */
export function isRelevantSemantic(row: SemanticRow, minZ = SEMANTIC_MIN_Z, minSimilarity = SEMANTIC_MIN_SIMILARITY): boolean {
  const z = zOf(row);
  return z !== null && z >= minZ && row.similarity >= minSimilarity;
}

/** Beri z-score tiap baris dan buang yang tidak relevan. Tanpa sebaran yang berarti (sd kosong/≈0) tidak ada hasil arti. */
export function pickSemantic(
  rows: SemanticRow[],
  minZ = SEMANTIC_MIN_Z,
  minSimilarity = SEMANTIC_MIN_SIMILARITY,
): (Ranked & { z: number })[] {
  return rows
    .filter((r) => isRelevantSemantic(r, minZ, minSimilarity))
    .map((r) => ({ ...r, z: zOf(r) as number }));
}

const keyOf = (row: Ranked) => (row.source_id ? `${row.source_type}:${row.source_id}` : row.id);

const RRF_K = 60;
const EXACT_TITLE_BONUS = 1;

/**
 * Gabungkan dua daftar berperingkat (arti + kata kunci) dengan Reciprocal Rank Fusion:
 * skor = jumlah 1/(60 + peringkat). Hasil yang muncul di kedua daftar naik ke atas,
 * duplikat digabung. Tidak perlu menyamakan skala skor kedua pencarian.
 */
export function mergeRanked(
  semantic: Ranked[],
  keyword: Ranked[],
  limit = 30,
  opts: { debug?: boolean; query?: string } = {},
): SearchHit[] {
  const merged = new Map<string, { row: Ranked; score: number; sem: boolean; kw: boolean }>();
  const add = (rows: Ranked[], kind: "sem" | "kw") => {
    rows.forEach((row, index) => {
      const entry = merged.get(keyOf(row)) ?? { row, score: 0, sem: false, kw: false };
      entry.score += 1 / (RRF_K + index + 1);
      if (kind === "sem") {
        entry.sem = true;
        entry.row = { ...entry.row, similarity: row.similarity, z: row.z };
      } else entry.kw = true;
      merged.set(keyOf(row), entry);
    });
  };
  add(semantic, "sem");
  add(keyword, "kw");

  // Judul yang persis sama dengan query (mis. mencari "Edot" -> partner Edot) selalu di atas: nilai RRF
  // maksimum ±0,033, jadi bonus ini mengalahkan hasil yang kebetulan muncul di kedua pencarian.
  const q = opts.query?.trim().toLowerCase();
  const bonus = (title: string) => (q && title.trim().toLowerCase() === q ? EXACT_TITLE_BONUS : 0);

  return Array.from(merged.values())
    .map((m) => ({ ...m, score: m.score + bonus(m.row.title) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, sem, kw }) => ({
      id: keyOf(row),
      sourceType: row.source_type as SearchSourceType,
      title: row.title,
      snippet: snippetOf(row.title, row.content_excerpt),
      urlPath: row.url_path,
      match: sem && kw ? "both" : sem ? "semantic" : "keyword",
      ...(opts.debug && row.similarity !== undefined && row.z !== undefined ? { debug: { similarity: row.similarity, z: row.z } } : {}),
    }));
}

/**
 * Kelompokkan hasil per jenis, urutan kelompok mengikuti hasil terbaiknya (hasil sudah terurut skor):
 * mencari nama klien menaruh "Clients & Partners" di atas, mencari topik menaruh Knowledge Base di atas.
 */
export function groupHits(hits: SearchHit[]): { type: SearchSourceType; hits: SearchHit[] }[] {
  const groups = new Map<SearchSourceType, SearchHit[]>();
  for (const hit of hits) groups.set(hit.sourceType, [...(groups.get(hit.sourceType) ?? []), hit]);
  return Array.from(groups, ([type, list]) => ({ type, hits: list }));
}
