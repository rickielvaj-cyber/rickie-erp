import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, IssueLog } from "@/lib/types";
import { truncate } from "./text";

// Pencarian issue langsung ke tabel issue_log: murni teks, tanpa embedding (issue tidak pernah dikirim ke Gemini).
// Melengkapi search_keyword di indeks, yang mensyaratkan SEMUA kata ada dan membuat issue bersaing dengan ratusan entri KB
// untuk 15 slot hasil. Di sini kalimat panjang ("gagal closing karena belum mapping") tetap menemukan issue yang
// memuat sebagian besar katanya, dan data selalu mutakhir (tidak menunggu indeks).

type Db = SupabaseClient<Database>;

export type SearchableIssue = Pick<
  IssueLog,
  "id" | "title" | "client_name" | "module" | "category" | "description" | "root_cause" | "resolution"
>;

export type IssueMatch = { issue: SearchableIssue; score: number; matched: number; total: number };

// Kata penghubung umum (Indonesia dan Inggris) yang tidak membantu mencari: "karena", "yang", "the", ...
const STOPWORDS = new Set([
  "yang", "dan", "di", "ke", "dari", "untuk", "pada", "dengan", "karena", "karna", "atau", "ini", "itu", "adalah", "bisa",
  "kenapa", "gimana", "bagaimana", "apa", "ada", "tidak", "tak", "nggak", "ga", "jadi", "sudah", "belum",
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are", "was", "why", "how", "what", "not", "can", "with",
]);

/** Kata pencarian: huruf kecil, minimal 2 karakter, tanpa kata penghubung (kecuali semua kata adalah kata penghubung). */
export function searchTerms(query: string): string[] {
  const all = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[\s,.;:!?()"'“”]+/u)
        .filter((t) => t.length >= 2),
    ),
  );
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  return meaningful.length > 0 ? meaningful : all;
}

/** Satu atau dua kata: semuanya harus ada. Tiga kata atau lebih: cukup 60% (dibulatkan ke atas, minimal dua). */
export function requiredMatches(total: number): number {
  return total <= 2 ? total : Math.max(2, Math.ceil(total * 0.6));
}

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase();

/** Skor satu issue: tiap kata yang ketemu di judul bernilai 3, di klien/modul/kategori 2, di deskripsi/akar masalah/solusi 1. */
export function matchIssue(issue: SearchableIssue, terms: string[]): IssueMatch | null {
  if (terms.length === 0) return null;
  const title = norm(issue.title);
  const meta = `${norm(issue.client_name)} ${norm(issue.module)} ${norm(issue.category)}`;
  const body = `${norm(issue.description)} ${norm(issue.root_cause)} ${norm(issue.resolution)}`;
  let score = 0;
  let matched = 0;
  for (const t of terms) {
    const inTitle = title.includes(t);
    const inMeta = meta.includes(t);
    const inBody = body.includes(t);
    if (!inTitle && !inMeta && !inBody) continue;
    matched++;
    score += inTitle ? 3 : inMeta ? 2 : 1;
  }
  if (matched < requiredMatches(terms.length)) return null;
  return { issue, score: score + matched / terms.length, matched, total: terms.length };
}

/** Peringkat issue untuk satu query: skor tertinggi dulu; urutan awal dipertahankan bila skor sama (daftar sudah terbaru dulu). */
export function rankIssues(issues: SearchableIssue[], query: string, limit = 30): IssueMatch[] {
  const terms = searchTerms(query);
  return issues
    .map((issue, index) => ({ m: matchIssue(issue, terms), index }))
    .filter((x): x is { m: IssueMatch; index: number } => x.m !== null)
    .sort((a, b) => b.m.score - a.m.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.m);
}

/** Cuplikan: bagian pertama dari akar masalah/solusi/deskripsi yang memuat salah satu kata; kalau tidak ada, awal deskripsi. */
export function issueSnippet(issue: SearchableIssue, terms: string[]): string {
  const fields: [string, string | null][] = [
    ["Root cause", issue.root_cause],
    ["Resolution", issue.resolution],
    ["", issue.description],
  ];
  const hit = fields.find(([, text]) => text && terms.some((t) => norm(text).includes(t)));
  const [label, text] = hit ?? ["", issue.description];
  const prefix = [issue.client_name, issue.module].filter(Boolean).join(" · ");
  const body = truncate(String(text ?? "").replace(/\s+/g, " ").trim(), 140);
  return [prefix, label ? `${label}: ${body}` : body].filter(Boolean).join(" — ");
}

const PAGE = 1000;

/** Baca issue (terbaru dulu) lalu beri peringkat. Skala data pribadi: ratusan sampai ribuan baris. */
export async function searchIssues(db: Db, query: string, limit = 30) {
  const rows: SearchableIssue[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("issue_log")
      .select("id, title, client_name, module, category, description, root_cause, resolution")
      .order("date_resolved", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const terms = searchTerms(query);
  return rankIssues(rows, query, limit).map((m) => ({
    id: m.issue.id,
    title: m.issue.title,
    snippet: issueSnippet(m.issue, terms),
    urlPath: `/issues?edit=${m.issue.id}`,
  }));
}
