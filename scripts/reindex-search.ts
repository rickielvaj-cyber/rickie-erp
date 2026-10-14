/**
 * Indeks ulang pencarian dari terminal (pertama kali setelah deploy, atau setelah impor besar):
 *
 *   npx tsx --env-file=.env.local scripts/reindex-search.ts          # hanya yang baru/berubah
 *   npx tsx --env-file=.env.local scripts/reindex-search.ts --force  # embed ulang semuanya
 *
 * Butuh di .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.
 * Kuota embedding gratis kecil: bila habis, skrip berhenti dengan rapi; jalankan lagi untuk melanjutkan.
 * Service role melewati RLS: hanya jalankan di komputer sendiri, jangan dibagikan.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/types";
import { describeReindex, reindexSearch } from "../lib/search/reindex";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.GEMINI_API_KEY) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY in .env.local.");
    process.exit(1);
  }

  const db = createClient<Database>(url, key, { auth: { persistSession: false } });
  // Dari terminal tidak ada batas waktu fungsi serverless; beri anggaran panjang.
  const result = await reindexSearch(db, { force: process.argv.includes("--force"), budgetMs: 10 * 60_000 });
  console.log(describeReindex(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
