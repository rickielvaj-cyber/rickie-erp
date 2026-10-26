import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { EmbeddingError, embedQuery, hasEmbeddingKey } from "./gemini";
import { isRelevantSemantic, mergeRanked, pickSemantic, SEMANTIC_MIN_SIMILARITY, SEMANTIC_MIN_Z, vectorLiteral, zOf, type SemanticRow } from "./text";
import { searchIssues } from "./issues";
import { EMBEDDED_TYPES, type SearchCandidate, type SearchHit, type SearchResponse, type SearchSourceType } from "./types";

type Db = SupabaseClient<Database>;

const TOP_N = 15;

type IssueHit = Awaited<ReturnType<typeof searchIssues>>[number];

/** Hasil issue dalam bentuk baris yang dipahami mergeRanked. */
const issueRow = (h: IssueHit) => ({
  id: `issue:${h.id}`,
  source_id: h.id,
  source_type: "issue",
  title: h.title,
  content_excerpt: h.snippet,
  url_path: h.urlPath,
  score: 0,
});

/** Selang-seling dua daftar yang sudah berurutan, dimulai dari yang pertama. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/**
 * Pencarian gabungan: arti (embedding + kemiripan kosinus) dan kata kunci persis berjalan paralel,
 * lalu digabung (lib/search/text.ts: mergeRanked). Issue tidak punya vektor; mereka dicari langsung di tabel issue_log
 * (lib/search/issues.ts: kata persis, kalimat panjang cukup cocok sebagian) dan diselipkan bergantian dengan hasil kata
 * kunci lain supaya tidak tergeser entri KB. Bila penyedia embedding tidak tersedia, tetap mengembalikan
 * hasil kata kunci dengan peringatan, bukan galat.
 *
 * `type` membatasi hasil ke satu jenis. type = "issue" hanya mencari issue (tanpa memanggil embedding sama sekali).
 */
export async function searchAll(
  db: Db,
  query: string,
  opts: { debug?: boolean; type?: SearchSourceType } = {},
): Promise<SearchResponse> {
  if (opts.type === "issue") {
    const hits = await searchIssues(db, query);
    const results: SearchHit[] = hits.map((h) => ({
      id: `issue:${h.id}`,
      sourceType: "issue",
      title: h.title,
      snippet: h.snippet,
      urlPath: h.urlPath,
      match: "keyword",
    }));
    return { query, results };
  }

  let warning: string | undefined;
  let rawSemantic: SemanticRow[] = [];

  // Jenis tanpa vektor (catatan, klien) tidak butuh embedding: filter ke jenis itu tidak memakai kuota Gemini.
  const wantsSemantic = !opts.type || EMBEDDED_TYPES.includes(opts.type);
  const semantic = async () => {
    if (!wantsSemantic) return [];
    if (!hasEmbeddingKey()) {
      warning = "Meaning-based search is off (GEMINI_API_KEY is not set); showing exact-word matches only.";
      return [];
    }
    try {
      const vector = await embedQuery(query);
      const { data, error } = await db.rpc("search_semantic_v2", {
        query_embedding: vectorLiteral(vector),
        match_count: TOP_N,
      });
      if (error) throw new Error(error.message);
      rawSemantic = (data ?? []) as SemanticRow[];
      return pickSemantic(rawSemantic);
    } catch (error) {
      warning = `Meaning-based search is unavailable right now (${error instanceof EmbeddingError ? error.message : "search error"}). Showing exact-word matches only.`;
      return [];
    }
  };

  const keyword = async () => {
    const { data, error } = await db.rpc("search_keyword", { search_text: query, match_count: TOP_N });
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  // Gagal membaca issue tidak menggagalkan pencarian: hasil issue dari indeks dipakai apa adanya.
  const liveIssues = () => searchIssues(db, query, 15).catch(() => null);

  const [sem, kwRaw, issues] = await Promise.all([semantic(), keyword(), liveIssues()]);
  const kw = issues ? interleave(kwRaw.filter((r) => r.source_type !== "issue"), issues.map(issueRow)) : kwRaw;
  const merged = mergeRanked(sem, kw, 30, { debug: opts.debug, query });
  const results = opts.type ? merged.filter((h) => h.sourceType === opts.type) : merged;

  if (results.length === 0 && !warning) {
    const { count } = await db.from("search_index").select("id", { count: "exact", head: true });
    if (count === 0) warning = "The search index is empty. Open Settings and press “Reindex Search” first.";
  }

  const debugInfo =
    opts.debug && rawSemantic.length > 0
      ? {
          candidates: rawSemantic.slice(0, 8).map<SearchCandidate>((r) => {
            const z = zOf(r) ?? 0;
            return {
              sourceType: r.source_type as SearchSourceType,
              title: r.title,
              similarity: r.similarity,
              adjusted: r.adjusted,
              z,
              accepted: isRelevantSemantic(r),
            };
          }),
          stats: { minZ: SEMANTIC_MIN_Z, minSimilarity: SEMANTIC_MIN_SIMILARITY, meanAdjusted: rawSemantic[0].mean_adj, sdAdjusted: rawSemantic[0].sd_adj },
        }
      : {};

  return { query, results, ...(warning ? { warning } : {}), ...debugInfo };
}
