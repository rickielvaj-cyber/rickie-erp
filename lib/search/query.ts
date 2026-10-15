import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { EmbeddingError, embedQuery, hasEmbeddingKey } from "./gemini";
import { mergeRanked, pickSemantic, vectorLiteral } from "./text";
import type { SearchResponse } from "./types";

type Db = SupabaseClient<Database>;

const TOP_N = 15;

/**
 * Pencarian gabungan: arti (embedding + kemiripan kosinus) dan kata kunci persis berjalan paralel,
 * lalu digabung (lib/search/text.ts: mergeRanked). Issue tidak punya vektor, jadi hanya muncul lewat
 * kata persis. Bila penyedia embedding tidak tersedia, tetap mengembalikan
 * hasil kata kunci dengan peringatan, bukan galat.
 */
export async function searchAll(db: Db, query: string, opts: { debug?: boolean } = {}): Promise<SearchResponse> {
  let warning: string | undefined;

  const semantic = async () => {
    if (!hasEmbeddingKey()) {
      warning = "Meaning-based search is off (GEMINI_API_KEY is not set); showing exact-word matches only.";
      return [];
    }
    try {
      const vector = await embedQuery(query);
      const { data, error } = await db.rpc("search_semantic", {
        query_embedding: vectorLiteral(vector),
        match_count: TOP_N,
      });
      if (error) throw new Error(error.message);
      return pickSemantic(data ?? []);
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

  const [sem, kw] = await Promise.all([semantic(), keyword()]);
  const results = mergeRanked(sem, kw, 30, { debug: opts.debug, query });

  if (results.length === 0 && !warning) {
    const { count } = await db.from("search_index").select("id", { count: "exact", head: true });
    if (count === 0) warning = "The search index is empty. Open Settings and press “Reindex Search” first.";
  }

  return { query, results, ...(warning ? { warning } : {}) };
}
