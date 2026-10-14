import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { EmbeddingError, embedQuery, hasEmbeddingKey } from "./gemini";
import { mergeRanked, vectorLiteral } from "./text";
import type { SearchResponse } from "./types";

type Db = SupabaseClient<Database>;

const TOP_N = 15;

/**
 * Di bawah ambang ini sebuah hasil semantik dianggap tidak relevan dan dibuang. Pencarian vektor
 * selalu mengembalikan "yang paling mirip" walau tidak ada yang mirip, jadi tanpa ambang
 * pencarian ngawur tetap menampilkan hasil. Nilai awal konservatif untuk text-embedding-3-small
 * (teks tak berhubungan biasanya di bawah ±0.2); sesuaikan setelah dicoba dengan data nyata.
 */
export const SEMANTIC_MIN_SIMILARITY = 0.25;

/**
 * Pencarian gabungan: arti (embedding + kemiripan kosinus) dan kata kunci persis berjalan paralel,
 * lalu digabung (lib/search/text.ts: mergeRanked). Issue tidak punya vektor, jadi hanya muncul lewat
 * kata persis. Bila penyedia embedding tidak tersedia, tetap mengembalikan
 * hasil kata kunci dengan peringatan, bukan galat.
 */
export async function searchAll(db: Db, query: string): Promise<SearchResponse> {
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
      return (data ?? []).filter((r) => r.similarity >= SEMANTIC_MIN_SIMILARITY);
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
  const results = mergeRanked(sem, kw);

  if (results.length === 0 && !warning) {
    const { count } = await db.from("search_index").select("id", { count: "exact", head: true });
    if (count === 0) warning = "The search index is empty. Open Settings and press “Reindex Search” first.";
  }

  return { query, results, ...(warning ? { warning } : {}) };
}
