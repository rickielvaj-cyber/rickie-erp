import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Klien dengan service role (melewati RLS): HANYA untuk kode server yang memang butuh, mis. tabel tanpa policy seperti error_log. Jangan pernah
 * diimpor dari komponen klien, dan selalu pastikan pemanggilnya sudah memeriksa login bila hasilnya sampai ke pengguna.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) throw new Error("Supabase service role is not configured.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
