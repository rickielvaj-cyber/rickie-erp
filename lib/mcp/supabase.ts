import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Klien Supabase atas nama pengguna yang token OAuth-nya sudah divalidasi.
 * Memakai ANON key + Authorization: Bearer <token pengguna>, jadi Postgres menjalankan RLS
 * (auth.uid() = user_id) persis seperti di situs. Service role key TIDAK dipakai di sini.
 */
export function createUserClient(accessToken: string) {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
