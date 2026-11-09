import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { legendFromObject, type ServerLegend } from "./legend";

/**
 * Baca legenda warna pengguna dari database (RLS: hanya barisnya sendiri). Gagal apa pun (mis. tabel belum ada karena migrasi belum
 * diterapkan) = "unavailable", sehingga tampilan kalender tidak pernah rusak dan tetap memakai legenda lokal di browser.
 */
export async function loadServerLegend(db: SupabaseClient<Database>): Promise<ServerLegend> {
  try {
    const { data, error } = await db.from("color_legend").select("names").maybeSingle();
    if (error) return { status: "unavailable" };
    if (!data) return { status: "none" };
    return { status: "ok", legend: legendFromObject(data.names) };
  } catch {
    return { status: "unavailable" };
  }
}
