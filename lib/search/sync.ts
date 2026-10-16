import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasEmbeddingKey } from "./gemini";
import { reindexSearch } from "./reindex";

/**
 * Perbarui indeks pencarian setelah konten (KB, proyek, goal, issue, klien) dibuat, diubah, atau dihapus.
 * Berjalan SETELAH respons terkirim (after), jadi menyimpan tidak jadi lambat, dan kegagalan apa pun
 * (kuota Gemini habis, jaringan) diam-diam diserahkan ke reindex harian/tombol Settings; penyimpanan
 * pengguna tidak pernah gagal karenanya. Hanya konten yang hash-nya berubah yang dikirim untuk di-embed.
 */
export function syncSearchAfterWrite() {
  if (!hasEmbeddingKey()) return;
  try {
    after(async () => {
      try {
        const db = await createClient();
        await reindexSearch(db, { budgetMs: 20_000 });
      } catch (error) {
        console.error("search sync skipped:", error instanceof Error ? error.message : error);
      }
    });
  } catch {
    // Dipanggil di luar konteks permintaan (mis. pengujian): tidak ada yang perlu disinkronkan.
  }
}
