"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { legendFromObject } from "@/lib/google/legend";

export type SaveLegendResult = { ok: true } | { ok: false; error: string };

/** Simpan legenda warna (satu baris per pengguna). Masukan dari browser dibersihkan lagi di sini: hanya warna dikenal dengan nama pendek yang layak. */
export async function saveColorLegend(raw: unknown): Promise<SaveLegendResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const names = legendFromObject(raw);
  const db = await createClient();
  const { error } = await db.from("color_legend").upsert({ user_id: user.id, names, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
