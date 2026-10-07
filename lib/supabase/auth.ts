import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AuthUser = { id: string; email: string | null };

// Siapa yang login — TANPA panggilan jaringan ke Supabase Auth.
//
// getUser() menembak server Auth tiap dipanggil; di production itu satu
// bolak-balik antar-benua per panggilan, dan sebelumnya dipanggil 3-4x
// berurutan per halaman (proxy, menu atas, layout, halaman). getClaims()
// memverifikasi tanda tangan JWT secara lokal (proyek ini pakai kunci
// asimetris ES256; kunci publiknya di-cache), dan sudah menyegarkan token yang
// hampir kedaluwarsa. cache() membuat hasilnya dipakai bersama di satu
// permintaan, jadi menu atas, layout, dan halaman cukup bertanya sekali.
//
// Catatan keamanan: akses data tetap dijaga RLS Postgres lewat JWT yang sama;
// ini cuma menentukan siapa yang dianggap login di sisi aplikasi. Konsekuensi
// kecil: sesi yang dicabut dari server baru dianggap habis saat access token-nya
// kedaluwarsa (default 1 jam), bukan seketika.
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});
