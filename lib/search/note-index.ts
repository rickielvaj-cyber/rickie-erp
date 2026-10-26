import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { displayTitle } from "@/lib/notes";
import { buildChunks, contentHash } from "./text";
import type { SearchDoc } from "./types";

// Catatan masuk indeks pencarian LANGSUNG saat disimpan (tanpa membaca seluruh isi website seperti reindex penuh), karena
// penyimpanan otomatis berjalan tiap beberapa detik saat mengetik. Catatan tidak di-embed, jadi tidak butuh kunci Gemini.
// Reindex penuh/cron tetap mencantumkan catatan (collectDocs) supaya baris ini tidak dianggap yatim.

type Db = SupabaseClient<Database>;

export type IndexableNote = { id: string; user_id: string; title: string; body: string; clientName: string | null };

/** Dokumen indeks untuk satu catatan (satu per potongan). Dipakai juga oleh reindex penuh. */
export function noteDocs(n: IndexableNote): SearchDoc[] {
  const title = displayTitle(n.title);
  const body = [n.clientName ? `Client: ${n.clientName}.` : "", n.body].filter(Boolean).join(" ");
  return buildChunks(title, body).map((excerpt, chunkIndex) => ({
    userId: n.user_id,
    sourceType: "note",
    sourceId: n.id,
    chunkIndex,
    title,
    excerpt,
    urlPath: `/notes/${n.id}`,
  }));
}

export async function indexNote(db: Db, note: IndexableNote): Promise<void> {
  const docs = noteDocs(note);
  const { error } = await db.from("search_index").upsert(
    docs.map((d) => ({
      user_id: d.userId,
      source_type: d.sourceType,
      source_id: d.sourceId,
      chunk_index: d.chunkIndex,
      title: d.title,
      content_excerpt: d.excerpt,
      content_hash: contentHash(d),
      embedding: null,
      url_path: d.urlPath,
    })),
    { onConflict: "user_id,source_type,source_id,chunk_index" },
  );
  if (error) throw new Error(error.message);
  // Catatan yang jadi lebih pendek: buang potongan yang tidak terpakai lagi.
  const { error: trimError } = await db
    .from("search_index")
    .delete()
    .eq("source_type", "note")
    .eq("source_id", note.id)
    .gte("chunk_index", docs.length);
  if (trimError) throw new Error(trimError.message);
}

export async function unindexNote(db: Db, noteId: string): Promise<void> {
  const { error } = await db.from("search_index").delete().eq("source_type", "note").eq("source_id", noteId);
  if (error) throw new Error(error.message);
}
