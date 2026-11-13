"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { parseRunningTimer, type RunningTimer } from "@/lib/focus-sync";

// Timer fokus yang sedang berjalan, dibagi antar perangkat (tabel focus_timer, migrasi 0033). Semua masukan dari browser divalidasi di sini.
// Tabel belum ada (migrasi belum diterapkan) atau galat apa pun = "tidak tersedia": timer tetap jalan di browser seperti sebelumnya.

export type PullResult = { available: true; state: RunningTimer | null } | { available: false };
export type PushResult = { ok: boolean };

export async function pullTimer(): Promise<PullResult> {
  const user = await getAuthUser();
  if (!user) return { available: false };
  const db = await createClient();
  const { data, error } = await db.from("focus_timer").select("state").eq("user_id", user.id).maybeSingle();
  if (error) return { available: false };
  return { available: true, state: data ? parseRunningTimer(data.state, Date.now()) : null };
}

/** Simpan (ganti) timer yang berjalan. Bentuk yang tidak sah ditolak. */
export async function pushTimer(raw: unknown): Promise<PushResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const state = parseRunningTimer(raw, Date.now());
  if (!state) return { ok: false };
  const db = await createClient();
  const { error } = await db.from("focus_timer").upsert({ user_id: user.id, state: state as unknown as Record<string, unknown>, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return { ok: !error };
}

/**
 * Hapus baris timer, tetapi HANYA bila waktu mulainya tidak lebih baru dari `upTo` (timer yang dihentikan atau selesai di sini). Timer yang
 * lebih baru, mis. yang baru dimulai di perangkat lain, tidak ikut terhapus.
 */
export async function clearTimer(upTo: unknown): Promise<PushResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false };
  if (typeof upTo !== "number" || !Number.isFinite(upTo)) return { ok: false };
  const db = await createClient();
  const { data, error } = await db.from("focus_timer").select("state").eq("user_id", user.id).maybeSingle();
  if (error) return { ok: false };
  if (!data) return { ok: true };
  const row = parseRunningTimer(data.state, Date.now());
  if (row && row.startedAt > upTo) return { ok: true }; // timer yang lebih baru: biarkan
  const { error: delError } = await db.from("focus_timer").delete().eq("user_id", user.id);
  return { ok: !delError };
}
